// /api/mapper — the maps of « Orga › Cartographier » (owner, 2026-11-06), kept in R2 (bucket cn-state, binding BUCKET), as the
// Tracer keeps its events:
//   mapper-meta/<id>.json        the map's card: title, owner, team, scale, standard, place (its summary also in the object's
//                                custom metadata, so the list is one R2 list)
//   mapper/<id>/doc              the map document (map.json of docs/mapper/model.md, gzip-compressed by the browser)
//   mapper/<id>/source           the OCAD file it came from, byte for byte (an OCAD export carries what was not changed through)
//   mapper/<id>/files/<sha>      backgrounds and images, stored once by their SHA-256 (the browser checks it)
//   mapper/<id>/v/<n>            saved versions (author, time, note in the metadata)
//   mapper/<id>/comments         the team's comments pinned on the map
//   mapper/<id>/photo/<pid>      the field mode's photos
//   mapper/<id>/presence         who is editing now and the sector each keeps (several mappers at once; saves merged in the browser)
//   mapper/<id>/invites          invitation links (only their tokens' hashes)
// A map is its team's (private by default): its creator and the accounts that joined by an invitation link — « mapper » edits,
// « viewer » reads and comments. Administrators see the list's figures, not the maps. Any account (but a demo one) creates maps,
// 40 at most, each up to MAX_DOC compressed.
//
//   GET    /api/mapper                       one's maps
//   POST   /api/mapper                       { title, scale?, standard?, place? } -> { id }
//   GET    /api/mapper/<id>                  the card, one's role, the lock held by another
//   PUT    /api/mapper/<id>                  owner and mappers: { title?, team?, scale?, standard?, place?, source? }
//   DELETE /api/mapper/<id>                  the owner: everything
//   GET|PUT /api/mapper/<id>/doc             PUT: X-Base-Version (409 when another version was saved since)
//   GET|PUT /api/mapper/<id>/source          the original OCAD file (PUT once, by an editor)
//   GET|PUT /api/mapper/<id>/files/<sha>     a background's or image's bytes
//   GET    /api/mapper/<id>/versions         the list;  GET …/versions/<n> one;  POST …/versions (body, X-Note)
//   GET|PUT /api/mapper/<id>/comments
//   GET|PUT|DELETE /api/mapper/<id>/photo/<pid>
//   POST|DELETE /api/mapper/<id>/presence   { sector?, at? } -> { editors, version } (also at …/lock, its former name)
//   GET|POST|DELETE /api/mapper/<id>/invites, POST /api/mapper/<id>/join   as the Tracer's
// A team may also hold club groups (docs/clubs/design.md §1, `orgGroups: [{ org, role: "mapper" }]`, set by the owner's PUT
// { orgGroups }, a club the owner belongs to): the club's mappers are mappers, resolved at read time (_lib/orgs.js).

import { allow, json, readBody, withUser, nowIso, isAdmin } from "../../_lib/api.js";
import { showModule } from "../../_lib/modules.js";
import { capOf } from "../../_lib/plans.js";
import { newToken, randomBytes, sha256hex } from "../../_lib/crypto.js";
import { cleanGroups, groupsText, inGroups, inGroupsIndexed, rightsIndex } from "../../_lib/orgs.js";

const META = "mapper-meta/", DATA = "mapper/";
const MAX_DOC = 60 * 1024 * 1024, MAX_FILE = 80 * 1024 * 1024, MAX_SMALL = 4 * 1024 * 1024, MAX_PHOTO = 4 * 1024 * 1024, MAX_VERSIONS = 60, MAX_MAPS = 40;
const ROLES = ["mapper", "viewer"];
const STANDARDS = ["ISOM2017-2", "ISSprOM2019-2", "ISMTBOM2022", "ISSkiOM2019", ""];
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const newId = () => Array.from(randomBytes(12), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
const PRESENCE_MS = 90e3, MAX_INVITES = 20, INVITE_DAYS = 7;
/** Who is editing a map: { uid: { name, until, sector, at } }, those not seen for PRESENCE_MS dropped. */
async function presence(env, base) {
  const o = await env.BUCKET.get(`${base}presence`);
  const all = o ? await o.json().catch(() => ({})) : {};
  for (const [u, x] of Object.entries(all)) if (!(x && x.until > Date.now())) delete all[u];
  return all;
}

const summary = (m) => ({ id: m.id, title: m.title, owner: String(m.owner), ownerName: m.ownerName || "",
  uids: m.team.filter((x) => x.uid).map((x) => x.uid).join(","), scale: String(m.scale || ""), standard: m.standard || "",
  place: m.place ? `${m.place.lat},${m.place.lon}` : "", updated: m.updated || "", version: String(m.version || 0), objects: String(m.objects || 0),
  groups: groupsText(m.orgGroups) });
async function loadMeta(env, id) {
  const o = await env.BUCKET.get(`${META}${id}.json`);
  if (!o) return null;
  try { return await o.json(); } catch (e) { return null; }
}
const saveMeta = (env, meta) => env.BUCKET.put(`${META}${meta.id}.json`, JSON.stringify(meta), { httpMetadata: { contentType: "application/json" }, customMetadata: summary(meta) });
async function listAll(env, prefix, include = true) {
  const out = [];
  let cursor;
  do {
    const r = await env.BUCKET.list({ prefix, cursor, include: include ? ["customMetadata"] : undefined, limit: 1000 });
    out.push(...r.objects);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}
function roleOf(meta, user) {
  if (meta.owner === user.id) return "owner";
  const m = meta.team.find((x) => x.uid && Number(x.uid) === user.id);
  return m ? m.role : null;
}
const canEdit = (r) => r === "owner" || r === "mapper";
const placeOf = (p) => (p && Number.isFinite(+p.lat) && Number.isFinite(+p.lon) && Math.abs(+p.lat) <= 90 && Math.abs(+p.lon) <= 180
  ? { lat: Math.round(+p.lat * 1e5) / 1e5, lon: Math.round(+p.lon * 1e5) / 1e5, cc: clean(p.cc, 2).toUpperCase() } : null);
async function loadInvites(env, base) {
  const o = await env.BUCKET.get(`${base}invites`);
  const list = o ? await o.json().catch(() => []) : [];
  return (Array.isArray(list) ? list : []).filter((x) => x.expires > Date.now());
}
const saveInvites = (env, base, list) => env.BUCKET.put(`${base}invites`, JSON.stringify(list), { httpMetadata: { contentType: "application/json" } });
function rawResponse(o, type = "application/octet-stream", cache = "no-store") {
  return new Response(o.body, { headers: { "Content-Type": o.httpMetadata?.contentType || type, "Cache-Control": cache,
    "X-Version": o.customMetadata?.version || "", "X-Updated": o.customMetadata?.updated || "", "X-Updated-By": o.customMetadata?.by || "" } });
}
async function putRaw(env, request, key, max, meta = {}) {
  const size = Number(request.headers.get("Content-Length") || 0);
  if (!size) return json({ error: "empty" }, 400);
  if (size > max) return json({ error: "too big" }, 413);
  const type = (request.headers.get("Content-Type") || "application/octet-stream").split(";")[0].trim();
  await env.BUCKET.put(key, request.body, { httpMetadata: { contentType: type }, customMetadata: meta });
  return null;
}

export const onRequest = withUser(async (ctx, user) => {
  const { request, env, params } = ctx;
  if (!env.BUCKET) return json({ error: "storage not configured" }, 500);
  const parts = [].concat(params.path || []).map(String).filter(Boolean);
  const method = request.method;

  if (!parts.length) {
    if (method === "GET") {
      const out = [];
      const all = await listAll(env, META);
      let rights = null;                             // the account's rights in its clubs, for the club groups (read once)
      for (const o of all) {
        const m = o.customMetadata || {};
        if (m.groups && !rights) rights = await rightsIndex(env, user);
        const mine = Number(m.owner) === user.id, member = (m.uids || "").split(",").includes(String(user.id))
          || (!!m.groups && inGroupsIndexed(rights, m.groups));
        if (!mine && !member) continue;
        out.push({ id: m.id, title: m.title, ownerName: m.ownerName, mine, scale: Number(m.scale) || null, standard: m.standard || "",
          place: m.place || "", updated: m.updated, objects: Number(m.objects) || 0 });
      }
      out.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
      const stats = new URL(request.url).searchParams.get("stats") && isAdmin(env, user)
        ? { maps: all.length, bytes: (await listAll(env, DATA, false)).reduce((s, o) => s + o.size, 0) } : null;
      return json({ maps: out, stats });
    }
    if (method === "POST") {
      const b = await readBody(request);
      if (!b) return json({ error: "bad request" }, 400);
      if (!(await allow(env, `mpcreate:${user.id}`, 30, 86400))) return json({ error: "too many" }, 429);
      const title = clean(b.title, 140);
      if (title.length < 2) return json({ error: "fields" }, 400);
      const owned = (await listAll(env, META)).filter((o) => Number(o.customMetadata?.owner) === user.id).length;
      if (owned >= MAX_MAPS) return json({ error: "quota", max: MAX_MAPS }, 409);
      const meta = { id: newId(), title, owner: user.id, ownerName: user.display_name || "", team: [],
        scale: Math.max(500, Math.min(100000, Number(b.scale) || 10000)), standard: STANDARDS.includes(b.standard) ? b.standard : "",
        place: placeOf(b.place), created: nowIso(), updated: nowIso(), version: 0, source: null, objects: 0 };
      await saveMeta(env, meta);
      await showModule(env, user.id, "carto");       // what the account starts here shows its module (_lib/modules.js, owner 2026-11-12)
      return json({ id: meta.id });
    }
    return json({ error: "method" }, 405);
  }

  const id = parts[0];
  if (!/^[a-z0-9]{8,16}$/.test(id)) return json({ error: "not found" }, 404);
  const meta = await loadMeta(env, id);
  if (!meta) return json({ error: "not found" }, 404);
  // a club group's mappers are mappers (resolved at read time)
  const role = roleOf(meta, user) || ((await inGroups(env, user, meta.orgGroups)) ? "mapper" : null);
  const sub = parts[1] || "";
  const base = `${DATA}${id}/`;
  if (sub === "join" && method === "POST") {
    if (!(await allow(env, `mpjoin:${user.id}`, 30, 3600))) return json({ error: "too many" }, 429);
    const b = await readBody(request);
    const h = b?.token ? await sha256hex(String(b.token).slice(0, 100)) : "";
    const inv = (await loadInvites(env, base)).find((x) => x.h === h);
    if (!inv) return json({ error: "invite" }, 410);
    if (role) return json({ ok: true, role, joined: false });
    meta.team.push({ uid: user.id, name: user.display_name || "", role: inv.role, joined: nowIso() });
    meta.updated = nowIso();
    await saveMeta(env, meta);
    await showModule(env, user.id, "carto");         // invited to a map: Carto shows (_lib/modules.js)
    return json({ ok: true, role: inv.role, joined: true });
  }
  if (!role) return json({ error: "forbidden" }, 403);

  if (!sub) {
    if (method === "GET") {
      const editors = await presence(env, base).then((p) => Object.entries(p).filter(([u]) => Number(u) !== user.id).map(([uid, x]) => ({ uid: Number(uid), ...x }))).catch(() => []);
      return json({ map: meta, role, you: { uid: user.id, name: user.display_name || "" }, editors });
    }
    if (method === "PUT") {
      if (!canEdit(role)) return json({ error: "forbidden" }, 403);
      const b = await readBody(request);
      if (!b) return json({ error: "bad request" }, 400);
      if (b.title != null) { const t = clean(b.title, 140); if (t.length < 2) return json({ error: "fields" }, 400); meta.title = t; }
      if (b.scale != null) meta.scale = Math.max(500, Math.min(100000, Number(b.scale) || meta.scale));
      if (b.standard != null && STANDARDS.includes(b.standard)) meta.standard = b.standard;
      if (b.place !== undefined) meta.place = placeOf(b.place);
      if (b.objects != null) meta.objects = Math.max(0, Number(b.objects) | 0);
      if (b.source !== undefined) meta.source = b.source ? { name: clean(b.source.name, 200), kind: clean(b.source.kind, 20), version: Number(b.source.version) || 0 } : null;
      if (b.orgGroups !== undefined) {
        if (meta.owner !== user.id) return json({ error: "forbidden" }, 403);
        meta.orgGroups = await cleanGroups(env, user, (b.orgGroups || []).map((g) => ({ ...g, role: "mapper" })), meta.orgGroups || []);
      }
      if (b.team != null) {
        if (meta.owner !== user.id) return json({ error: "forbidden" }, 403);
        if (!Array.isArray(b.team) || b.team.length > 60) return json({ error: "team" }, 400);
        meta.team = meta.team.flatMap((m) => {
          const x = b.team.find((y) => y && Number(y.uid) === Number(m.uid));
          return x ? [{ ...m, role: ROLES.includes(x.role) ? x.role : m.role }] : [];
        });
      }
      meta.updated = nowIso();
      await saveMeta(env, meta);
      return json({ ok: true, map: meta });
    }
    if (method === "DELETE") {
      if (role !== "owner") return json({ error: "forbidden" }, 403);
      const keys = (await listAll(env, base, false)).map((o) => o.key);
      for (let i = 0; i < keys.length; i += 1000) await env.BUCKET.delete(keys.slice(i, i + 1000));
      await env.BUCKET.delete(`${META}${id}.json`);
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "invites") {
    if (!canEdit(role)) return json({ error: "forbidden" }, 403);
    const list = await loadInvites(env, base);
    const shown = (x) => ({ n: x.n, role: x.role, by: x.byName || "", created: x.created, expires: x.expires });
    if (method === "GET") return json({ invites: list.map(shown) });
    if (method === "POST") {
      const b = await readBody(request);
      if (!b || !ROLES.includes(b.role)) return json({ error: "bad request" }, 400);
      if (!(await allow(env, `mpinvite:${user.id}`, 40, 86400))) return json({ error: "too many" }, 429);
      if (list.length >= MAX_INVITES) return json({ error: "too many invites" }, 409);
      const token = newToken(), days = Math.min(30, Math.max(1, Number(b.days) || INVITE_DAYS));
      const x = { n: Math.max(0, ...list.map((y) => y.n)) + 1, h: await sha256hex(token), role: b.role, by: user.id,
        byName: user.display_name || "", created: Date.now(), expires: Date.now() + days * 864e5 };
      await saveInvites(env, base, [...list, x]);
      return json({ token, ...shown(x) });
    }
    if (method === "DELETE") {
      const n = Number(new URL(request.url).searchParams.get("n"));
      await saveInvites(env, base, list.filter((x) => x.n !== n));
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "doc") {
    if (method === "GET") {
      const o = await env.BUCKET.get(`${base}doc`);
      return o ? rawResponse(o, "application/gzip") : json({ error: "empty" }, 404);
    }
    if (method === "PUT") {
      if (!canEdit(role)) return json({ error: "forbidden" }, 403);
      if (!(await allow(env, `mpsave:${user.id}`, 3000, 86400))) return json({ error: "too many" }, 429);
      const baseVersion = Number(request.headers.get("X-Base-Version") ?? -1);
      if (baseVersion >= 0 && baseVersion !== (meta.version || 0)) return json({ error: "conflict", version: meta.version, by: meta.updatedBy || "", at: meta.updated }, 409);
      const version = (meta.version || 0) + 1;
      const err = await putRaw(env, request, `${base}doc`, MAX_DOC, { version: String(version), updated: nowIso(), by: user.display_name || "" });
      if (err) return err;
      meta.version = version; meta.updated = nowIso(); meta.updatedBy = user.display_name || "";
      const n = Number(request.headers.get("X-Objects"));
      if (Number.isFinite(n) && n >= 0) meta.objects = n | 0;
      await saveMeta(env, meta);
      return json({ ok: true, version });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "source") {
    if (method === "GET") {
      const o = await env.BUCKET.get(`${base}source`);
      return o ? rawResponse(o, "application/octet-stream", "private, max-age=600") : json({ error: "not found" }, 404);
    }
    if (method === "PUT") {
      if (!canEdit(role)) return json({ error: "forbidden" }, 403);
      if (!(await allow(env, `mpfile:${user.id}`, 300, 86400))) return json({ error: "too many" }, 429);
      const err = await putRaw(env, request, `${base}source`, MAX_FILE, { updated: nowIso() });
      return err || json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "files") {
    const sha = String(parts[2] || "");
    if (!/^[0-9a-f]{64}$/.test(sha)) return json({ error: "file" }, 400);
    const key = `${base}files/${sha}`;
    if (method === "GET") {
      const o = await env.BUCKET.get(key);
      return o ? rawResponse(o, "application/octet-stream", "private, max-age=31536000, immutable") : json({ error: "not found" }, 404);
    }
    if (method === "HEAD") {
      const o = await env.BUCKET.head(key);
      return new Response(null, { status: o ? 200 : 404 });
    }
    if (method === "PUT") {
      if (!canEdit(role)) return json({ error: "forbidden" }, 403);
      if (!(await allow(env, `mpfile:${user.id}`, 300, 86400))) return json({ error: "too many" }, 429);
      if (await env.BUCKET.head(key)) return json({ ok: true, kept: true });
      const err = await putRaw(env, request, key, MAX_FILE, { updated: nowIso() });
      return err || json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "versions") {
    const n = parts[2];
    if (method === "GET" && n == null) {
      const list = (await listAll(env, `${base}v/`)).map((o) => ({ n: Number(o.key.slice(`${base}v/`.length)), size: o.size, at: o.customMetadata?.at || "",
        by: o.customMetadata?.by || "", note: o.customMetadata?.note || "" })).sort((a, b) => b.n - a.n);
      return json({ versions: list });
    }
    if (method === "GET") {
      const o = /^\d+$/.test(n) ? await env.BUCKET.get(`${base}v/${n}`) : null;
      return o ? rawResponse(o, "application/gzip") : json({ error: "not found" }, 404);
    }
    if (method === "POST") {
      if (!canEdit(role)) return json({ error: "forbidden" }, 403);
      if (!(await allow(env, `mpversion:${user.id}`, 200, 86400))) return json({ error: "too many" }, 429);
      const list = (await listAll(env, `${base}v/`, false)).map((o) => Number(o.key.slice(`${base}v/`.length))).sort((a, b) => a - b);
      const next = (list[list.length - 1] || 0) + 1;
      const note = decodeURIComponent(request.headers.get("X-Note") || "").slice(0, 300);
      const err = await putRaw(env, request, `${base}v/${next}`, MAX_DOC, { at: nowIso(), by: user.display_name || "", note });
      if (err) return err;
      // how many are kept: the capability « cartoVersions » (_lib/plans.js; MAX_VERSIONS under today's pack), null: all
      const keep = await capOf(env, user, "cartoVersions").catch(() => MAX_VERSIONS);
      if (keep !== null && keep !== undefined && list.length + 1 > keep) await env.BUCKET.delete(list.slice(0, list.length + 1 - Math.max(1, keep)).map((k) => `${base}v/${k}`));
      return json({ ok: true, n: next });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "comments") {
    if (method === "GET") {
      const o = await env.BUCKET.get(`${base}comments`);
      return o ? rawResponse(o, "application/json") : json({ empty: true });
    }
    if (method === "PUT") {
      if (!(await allow(env, `mpcomments:${user.id}`, 1000, 86400))) return json({ error: "too many" }, 429);
      const err = await putRaw(env, request, `${base}comments`, MAX_SMALL, { updated: nowIso(), by: user.display_name || "" });
      return err || json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "photo") {
    const pid = String(parts[2] || "");
    if (!/^[a-z0-9-]{6,48}$/.test(pid)) return json({ error: "photo" }, 400);
    if (method === "GET") {
      const o = await env.BUCKET.get(`${base}photo/${pid}`);
      return o ? rawResponse(o, "image/jpeg", "private, max-age=31536000, immutable") : json({ error: "not found" }, 404);
    }
    if (!canEdit(role)) return json({ error: "forbidden" }, 403);
    if (method === "PUT") {
      if (!(await allow(env, `mpphoto:${user.id}`, 400, 86400))) return json({ error: "too many" }, 429);
      const err = await putRaw(env, request, `${base}photo/${pid}`, MAX_PHOTO, { updated: nowIso(), by: user.display_name || "" });
      return err || json({ ok: true });
    }
    if (method === "DELETE") { await env.BUCKET.delete(`${base}photo/${pid}`); return json({ ok: true }); }
    return json({ error: "method" }, 405);
  }

  // several mappers at once (owner, 2026-11-06): who is editing, refreshed every 30 s, each with the sector they keep for themselves
  // (a rectangle of the map, in mm: the others' editors refuse to change what lies in it); saves are merged in the browser
  if (sub === "lock" || sub === "presence") {
    if (!canEdit(role)) return json({ error: "forbidden" }, 403);
    const all = await presence(env, base);
    if (method === "POST") {
      const b = (await readBody(request)) || {};
      const sec = Array.isArray(b.sector) && b.sector.length === 4 && b.sector.every((v) => Number.isFinite(+v)) ? b.sector.map((v) => Math.round(+v * 100) / 100) : null;
      all[user.id] = { name: user.display_name || "", until: Date.now() + PRESENCE_MS, sector: sec, at: b.at && b.at.length === 2 ? b.at.map((v) => Math.round(+v * 10) / 10) : null };
      await env.BUCKET.put(`${base}presence`, JSON.stringify(all), { httpMetadata: { contentType: "application/json" } });
      return json({ ok: true, editors: Object.entries(all).filter(([u]) => Number(u) !== user.id).map(([uid, x]) => ({ uid: Number(uid), ...x })), version: meta.version || 0 });
    }
    if (method === "DELETE") {
      if (all[user.id]) { delete all[user.id]; await env.BUCKET.put(`${base}presence`, JSON.stringify(all), { httpMetadata: { contentType: "application/json" } }); }
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }
  return json({ error: "not found" }, 404);
});
