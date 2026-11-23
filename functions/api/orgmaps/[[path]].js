// /api/orgmaps — the club's map library (docs/clubs/design.md §2, migration 0030: org_maps, org_map_versions; the rights and the
// storage in functions/_lib/orgmaps.js; the page « Mon club › Cartes », site/assets/js/pages/clubmaps.js). A map is files sent —
// OCAD, Mapper, PDF, an image with its world file and .prj, a KMZ — kept byte for byte, each version's apart, with a viewing
// copy and a thumbnail the browser makes (as « Mes cartes »); or a Cartographier document linked (carto_id, not copied). Signed-in
// accounts only (the login gate). Every route answers 503 { error: "not ready" } before migration 0030.
//
//   GET    /api/orgmaps/usable?use=tracer|analyses|pixel   the maps the account may use in that tool: those of its clubs whose
//                                                    access lets it use them and whose use is written down -> { maps: [{ org,
//                                                    orgName, id, name, version, files, scale, standard, lent }] }
//   GET    /api/orgmaps/s/<token>                    a map shared by a link (the « guest link »): its card and what the link allows
//   GET    /api/orgmaps/s/<token>/view | /thumb | /file/<name>
//   GET    /api/orgmaps/<org>                        the library: { maps (each with `may`), quota: { used, limit }, may: { add } };
//                                                    an embargoed map shows only its name and end day to those who may not see it
//   POST   /api/orgmaps/<org>/maps                   editors (manager, mapper): { name, country, region, dept, lat, lon, scale,
//                                                    standard, surveyed, revised, mappers, area_km2, state, geo, carto_id? } -> { map }
//                                                    (version 1, its files then sent one by one)
//   GET    /api/orgmaps/<org>/maps/<id>              the card, its versions, its uses, what the account may do
//   PUT    /api/orgmaps/<org>/maps/<id>              editors: the card's fields; governors (manager; a mapper for the maps it
//                                                    added): embargo { until, note, ok: [event ids] }, rights { tracer, analyses,
//                                                    pixel, thumb: true|false — each written down with who and when }, access
//                                                    { organiser, member: list|thumb|view|use|download }
//   DELETE /api/orgmaps/<org>/maps/<id>              governors: status « removed », every file deleted
//   PUT    /api/orgmaps/<org>/maps/<id>/files?name=  editors: a file of the current version (the body, 80 MB at most); the same
//                                                    name again replaces it.  DELETE …/files?name= one taken out
//   POST   /api/orgmaps/<org>/maps/<id>/versions     editors: { note } a new version, empty, its files then sent; the previous
//                                                    kept, with its files
//   GET    /api/orgmaps/<org>/maps/<id>/file/<name>?v=&use=&event=   a file: to those who may download it, or to one using it
//                                                    in a tool (use= tracer|analyses|pixel: lent)
//   GET    /api/orgmaps/<org>/maps/<id>/carto/doc | /carto/source?use=   a linked Cartographier document and the OCAD file it
//                                                    came from (X-Version: the document's version), for the browser to write
//                                                    the map as an OCAD file: to those who may download it, use it in that tool,
//                                                    or edit the card (its pictures); « carto gone » when the document was deleted
//   GET|PUT /api/orgmaps/<org>/maps/<id>/view | /thumb   the viewing copy (6 MB) and thumbnail (600 KB), WebP or JPEG
//   POST   /api/orgmaps/<org>/maps/<id>/uses         { tool, ref, title } a use recorded (a tool that took the map)
//   GET    /api/orgmaps/<org>/maps/<id>/links        governors: the share links;  POST { download, use, days } -> { link };
//                                                    DELETE …/links/<hash>
// A club holds 3 GB (every version's files; env ORGMAPS_QUOTA_MB): 413 { error: "quota", used, limit }.
// Account deletion leaves the maps: they are the club's (created_by then names nobody).

import { allow, isAdmin, json, nowIso, parisToday, readBody, siteUrl, withUser } from "../../_lib/api.js";
import { newToken, sha256hex } from "../../_lib/crypto.js";
import { inGroups, notReady, orgById, orgsOf, ready, rightsOf, rolesOf } from "../../_lib/orgs.js";
import {
  LEVELS, STATES, USES, WRITTEN, accessOf, embargoed, fileKey, key, mapRow, mayUse, parse, quota, recordUse, used, usesOf,
} from "../../_lib/orgmaps.js";

const MAX_FILE = 80 * 1024 * 1024, MAX_VIEW = 6 * 1024 * 1024, MAX_THUMB = 600 * 1024, MAX_FILES = 12, MAX_MAPS = 500;
const IMG = ["image/jpeg", "image/webp", "image/png"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const num = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const year = (v) => (/^(1[89]|20)\d{2}$/.test(String(v ?? "").trim()) ? String(v).trim() : "");
/** A file's name kept: its base name, no path, no character a key or a header would choke on. */
const fileName = (s) => String(s || "").split(/[\\/]/).pop().replace(/[\u0000-\u001f"<>|*?:]+/g, "_").trim().slice(0, 120);
const nameOf = (u) => u.display_name || `${u.first_name || ""} ${u.last_name || ""}`.trim();
function cleanGeo(g) {
  if (!g || typeof g !== "object") return null;
  const o = {};
  for (const k of ["a", "b", "c", "d", "e", "f"]) { if (!Number.isFinite(g[k])) return null; o[k] = g[k]; }
  return Math.abs(o.a * o.e - o.b * o.d) > 1e-12 ? o : null;
}

export const onRequest = withUser(async (ctx, user) => {
  const { env } = ctx;
  if (!env.BUCKET) return json({ error: "server not configured" }, 500);
  if (!(await ready(env))) return json({ error: "not ready" }, 503);
  try { return await route(ctx, user); }
  catch (e) { if (notReady(e)) return json({ error: "not ready" }, 503); throw e; }
});

async function route({ request, env, params }, user) {
  const parts = [].concat(params.path || []).map(String).filter(Boolean);
  const method = request.method, url = new URL(request.url);
  const writing = method !== "GET";
  if (writing && user.demo_until) return json({ error: "demo" }, 403);
  if (writing && !(await allow(env, `orgmaps:${user.id}`, 1500, 86400))) return json({ error: "too many" }, 429);

  if (parts[0] === "usable" && method === "GET") return json({ maps: await usable(env, user, String(url.searchParams.get("use") || "")) });
  if (parts[0] === "s") return shared(env, user, parts.slice(1), method);

  const orgId = Number(parts[0]);
  const org = Number.isInteger(orgId) && orgId > 0 ? await orgById(env, orgId) : null;
  if (!org) return json({ error: "not found" }, 404);
  const R = rightsOf(await rolesOf(env, user.id, org.id).catch(() => null));
  const admin = isAdmin(env, user);
  const editor = admin || R.manage || R.map;

  if (parts.length === 1) {
    if (method !== "GET") return json({ error: "method" }, 405);
    if (!R.member && !admin) return json({ maps: [], quota: null, may: { add: false }, member: false });
    const { results } = await env.DB.prepare("SELECT * FROM org_maps WHERE org_id = ? AND status = 'active' ORDER BY name COLLATE NOCASE").bind(org.id).all();
    const maps = [];
    for (const m of results) {
      const A = await accessOf(env, user, m, R);
      if (A.list) maps.push(listView(m, A));
    }
    return json({ maps, quota: editor ? { used: await used(env, org.id), limit: quota(env) } : null, may: { add: editor }, member: true });
  }

  if (parts[1] !== "maps") return json({ error: "not found" }, 404);
  if (parts.length === 2) {
    if (method !== "POST") return json({ error: "method" }, 405);
    if (!editor) return json({ error: "forbidden" }, 403);
    const b = await readBody(request);
    if (!b) return json({ error: "fields" }, 400);
    const name = clean(b.name, 120);
    if (name.length < 2) return json({ error: "name" }, 400);
    const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM org_maps WHERE org_id = ? AND status = 'active'").bind(org.id).first();
    if (Number(n?.n) >= MAX_MAPS) return json({ error: "too many" }, 429);
    let carto = null;
    if (b.carto_id) {
      carto = clean(b.carto_id, 20);
      if (!(await cartoOpens(env, user, carto))) return json({ error: "carto" }, 403);
    }
    const now = nowIso(), f = cardFields(b, {});
    const row = await env.DB.prepare(`INSERT INTO org_maps (org_id, name, country, region, dept, lat, lon, scale, standard, surveyed, revised, mappers,
        area_km2, state, carto_id, version, files, geo, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, '[]', ?, ?, ?, ?) RETURNING *`)
      .bind(org.id, name, f.country, f.region, f.dept, f.lat, f.lon, f.scale, f.standard, f.surveyed, f.revised, f.mappers, f.area_km2, f.state,
        carto, f.geo, user.id, now, now).first();
    await env.DB.prepare("INSERT INTO org_map_versions (map_id, version, files, note, by_user, at) VALUES (?, 1, '[]', ?, ?, ?)")
      .bind(row.id, clean(b.note, 300), user.id, now).run();
    return json({ map: fullView(row, await accessOf(env, user, row, R)) });
  }

  const m = await mapRow(env, parts[2]);
  if (!m || m.org_id !== org.id) return json({ error: "not found" }, 404);
  const A = await accessOf(env, user, m, R);
  if (!A.list) return json({ error: "forbidden" }, 403);
  const sub = parts[3] || "";
  const base = (rest) => key(org.id, m.id, rest);

  if (!sub) {
    if (method === "GET") {
      if (A.embargoed && !A.view && !A.edit) return json({ map: listView(m, A) });
      const { results: vs } = await env.DB.prepare("SELECT version, files, note, by_user, at FROM org_map_versions WHERE map_id = ? ORDER BY version DESC").bind(m.id).all();
      const who = await names(env, [m.created_by, ...vs.map((v) => v.by_user)]);
      const out = { map: fullView(m, A), versions: vs.map((v) => ({ version: v.version, files: parse(v.files, []).map(fileView), note: v.note, by: who[v.by_user] || "", at: v.at })),
        uses: A.view || A.edit ? await usesOf(env, m) : [], by: who[m.created_by] || "" };
      if (A.govern) {
        const ids = parse(m.embargo_ok, []);
        if (ids.length) {
          const { results } = await env.DB.prepare(`SELECT id, name, date FROM events WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids.map(String)).all().catch(() => ({ results: [] }));
          out.embargoEvents = results;
        }
      }
      return json(out);
    }
    if (method === "PUT") {
      const b = await readBody(request);
      if (!b) return json({ error: "fields" }, 400);
      if (!A.edit) return json({ error: "forbidden" }, 403);
      const f = cardFields(b, m);
      const name = "name" in b ? clean(b.name, 120) : m.name;
      if (name.length < 2) return json({ error: "name" }, 400);
      let { embargo_until: eu, embargo_note: en, embargo_ok: eo, rights, access } = m;
      if ("embargo" in b || "rights" in b || "access" in b) {
        if (!A.govern) return json({ error: "forbidden" }, 403);
        if ("embargo" in b) {
          const e = b.embargo || {};
          eu = DAY.test(String(e.until || "")) ? String(e.until) : null;
          en = eu ? clean(e.note, 300) : "";
          eo = JSON.stringify(eu && Array.isArray(e.ok) ? [...new Set(e.ok.map((x) => clean(x, 20)).filter(Boolean))].slice(0, 20) : []);
        }
        if ("rights" in b) {
          const r = parse(m.rights, {}), now = nowIso();
          for (const k of WRITTEN) {
            if (!(k in (b.rights || {}))) continue;
            if (b.rights[k]) { if (!r[k]) r[k] = { by: user.id, name: nameOf(user), at: now }; } else delete r[k];
          }
          rights = JSON.stringify(r);
        }
        if ("access" in b) {
          const a = parse(m.access, {});
          for (const k of ["organiser", "member"]) {
            if (!(k in (b.access || {}))) continue;
            if (LEVELS.includes(b.access[k])) a[k] = b.access[k]; else delete a[k];
          }
          access = JSON.stringify(a);
        }
      }
      await env.DB.prepare(`UPDATE org_maps SET name = ?, country = ?, region = ?, dept = ?, lat = ?, lon = ?, scale = ?, standard = ?, surveyed = ?,
          revised = ?, mappers = ?, area_km2 = ?, state = ?, geo = ?, embargo_until = ?, embargo_note = ?, embargo_ok = ?, rights = ?, access = ?, updated_at = ?
        WHERE id = ?`).bind(name, f.country, f.region, f.dept, f.lat, f.lon, f.scale, f.standard, f.surveyed, f.revised, f.mappers, f.area_km2, f.state, f.geo,
        eu, en, eo, rights, access, nowIso(), m.id).run();
      const n = await mapRow(env, m.id);
      return json({ map: fullView(n, await accessOf(env, user, n, R)) });
    }
    if (method === "DELETE") {
      if (!A.govern) return json({ error: "forbidden" }, 403);
      await dropPrefix(env, key(org.id, m.id, ""));
      await env.DB.batch([env.DB.prepare("UPDATE org_maps SET status = 'removed', files = '[]', updated_at = ? WHERE id = ?").bind(nowIso(), m.id),
        env.DB.prepare("DELETE FROM org_map_versions WHERE map_id = ?").bind(m.id)]);
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  // ---- the files of the current version
  if (sub === "files") {
    if (!A.edit) return json({ error: "forbidden" }, 403);
    const name = fileName(url.searchParams.get("name"));
    if (!name) return json({ error: "name" }, 400);
    const files = parse(m.files, []);
    if (method === "PUT") {
      const size = Number(request.headers.get("Content-Length") || 0);
      if (!size) return json({ error: "empty" }, 400);
      if (size > MAX_FILE) return json({ error: "size" }, 413);
      if (!files.some((x) => x.name === name) && files.length >= MAX_FILES) return json({ error: "too many files" }, 400);
      const old = files.find((x) => x.name === name)?.size || 0, u = await used(env, org.id), limit = quota(env);
      if (u - old + size > limit) return json({ error: "quota", used: u, limit }, 413);
      const type = clean((request.headers.get("Content-Type") || "application/octet-stream").split(";")[0], 80) || "application/octet-stream";
      const k = fileKey(org.id, m.id, m.version, name);
      const obj = await env.BUCKET.put(k, request.body, { httpMetadata: { contentType: type } });
      const next = [...files.filter((x) => x.name !== name), { name, key: k, size: obj?.size || size, type }];
      await saveFiles(env, m, next);
      return json({ ok: true, files: next.map(fileView) });
    }
    if (method === "DELETE") {
      const f = files.find((x) => x.name === name);
      if (!f) return json({ error: "not found" }, 404);
      await env.BUCKET.delete(f.key);
      const next = files.filter((x) => x.name !== name);
      await saveFiles(env, m, next);
      return json({ ok: true, files: next.map(fileView) });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "versions") {
    if (method !== "POST") return json({ error: "method" }, 405);
    if (!A.edit) return json({ error: "forbidden" }, 403);
    if (m.carto_id) return json({ error: "carto" }, 400);
    const b = (await readBody(request)) || {};
    const v = m.version + 1, now = nowIso();
    await env.DB.batch([env.DB.prepare("INSERT INTO org_map_versions (map_id, version, files, note, by_user, at) VALUES (?, ?, '[]', ?, ?, ?)").bind(m.id, v, clean(b.note, 300), user.id, now),
      env.DB.prepare("UPDATE org_maps SET version = ?, files = '[]', updated_at = ? WHERE id = ?").bind(v, now, m.id)]);
    // the viewing copy and thumbnail are the new version's to make (the browser sends them with its files)
    return json({ ok: true, version: v, uses: (await usesOf(env, m)).filter((x) => x.version < v) });
  }

  if (sub === "file" && method === "GET") {
    const name = fileName(decodeURIComponent(parts.slice(4).join("/")));
    const use = String(url.searchParams.get("use") || "");
    if (!(A.download || (use && mayUse(A, m, use)))) return json({ error: "forbidden" }, 403);
    const v = Number(url.searchParams.get("v")) || m.version;
    let files = parse(m.files, []);
    if (v !== m.version) {
      const r = await env.DB.prepare("SELECT files FROM org_map_versions WHERE map_id = ? AND version = ?").bind(m.id, v).first();
      if (!r) return json({ error: "not found" }, 404);
      files = parse(r.files, []);
    }
    const f = files.find((x) => x.name === name);
    const o = f ? await env.BUCKET.get(f.key) : null;
    if (!o) return json({ error: "not found" }, 404);
    return new Response(o.body, { headers: { "Content-Type": o.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}` } });
  }

  // a Cartographier document linked: its document (gzip JSON, as Cartographier keeps it) and the OCAD file it came from, for the
  // browser to write the map as an OCAD file (site/assets/js/orgmapuse.js cartoFile) — to those who may download the map, use it
  // in a tool (use=), or make its pictures (editors)
  if (sub === "carto" && method === "GET") {
    if (!m.carto_id) return json({ error: "not found" }, 404);
    const use = String(url.searchParams.get("use") || "");
    if (!(A.download || A.edit || (use && mayUse(A, m, use)))) return json({ error: "forbidden" }, 403);
    const what = parts[4] || "";
    if (what !== "doc" && what !== "source") return json({ error: "not found" }, 404);
    const c = await cartoCard(env, m.carto_id);
    if (!c) return json({ error: "carto gone" }, 404);
    const o = await env.BUCKET.get(`mapper/${m.carto_id}/${what}`);
    if (!o) return json({ error: what === "doc" ? "carto gone" : "not found" }, 404);
    return new Response(o.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store", "X-Version": String(c.version) } });
  }

  if (sub === "view" || sub === "thumb") {
    if (method === "GET") {
      if (!(sub === "thumb" ? A.thumb : A.view)) return json({ error: "forbidden" }, 403);
      return serve(env, base(sub), m.updated_at);
    }
    if (method === "PUT") {
      if (!A.edit) return json({ error: "forbidden" }, 403);
      const type = String(request.headers.get("Content-Type") || "").split(";")[0].trim();
      if (!IMG.includes(type)) return json({ error: "type" }, 415);
      const buf = await request.arrayBuffer();
      if (!buf.byteLength || buf.byteLength > (sub === "view" ? MAX_VIEW : MAX_THUMB)) return json({ error: "size" }, 413);
      await env.BUCKET.put(base(sub), buf, { httpMetadata: { contentType: type } });
      await env.DB.prepare("UPDATE org_maps SET updated_at = ? WHERE id = ?").bind(nowIso(), m.id).run();
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "uses" && method === "POST") {
    const b = await readBody(request);
    const tool = String(b?.tool || "");
    if (!USES.includes(tool) || !mayUse(A, m, tool)) return json({ error: "forbidden" }, 403);
    await recordUse(env, { org: org.id, map: m.id, version: Number(b.version) || m.version }, { tool, ref: b.ref, title: b.title }, user);
    return json({ ok: true });
  }

  if (sub === "links") {
    if (!A.govern) return json({ error: "forbidden" }, 403);
    const acc = parse(m.access, {});
    const links = (Array.isArray(acc.links) ? acc.links : []).filter((x) => x.until >= parisToday());
    const save = (list) => env.DB.prepare("UPDATE org_maps SET access = ?, updated_at = ? WHERE id = ?").bind(JSON.stringify({ ...acc, links: list }), nowIso(), m.id).run();
    if (method === "GET") return json({ links: links.map((x) => ({ h: x.h.slice(0, 12), until: x.until, download: !!x.download, use: !!x.use, by: x.name || "", at: x.at })) });
    if (method === "POST") {
      const b = (await readBody(request)) || {};
      if (links.length >= 20) return json({ error: "too many" }, 429);
      const token = newToken(), days = Math.min(365, Math.max(1, Math.round(Number(b.days) || 30)));
      const until = new Date(Date.now() + days * 86400e3).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
      await save([...links, { h: await sha256hex(token), until, download: !!b.download, use: !!b.use, by: user.id, name: nameOf(user), at: nowIso() }]);
      const site = siteUrl(env) || new URL(request.url).origin;
      return json({ ok: true, link: `${site}/#/monclub?carte=${encodeURIComponent(token)}`, until });
    }
    if (method === "DELETE") {
      const h = String(parts[4] || "");
      if (h.length < 8) return json({ error: "not found" }, 404);
      await save(links.filter((x) => !x.h.startsWith(h)));
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }
  return json({ error: "not found" }, 404);
}

// ---- the card's fields, cleaned (a field not sent keeps the map's) ------------------------------------------------------------
function cardFields(b, m) {
  const v = (k, f) => (k in b ? f(b[k]) : m[k] ?? f(undefined));
  const lat = v("lat", num), lon = v("lon", num);
  const ok = lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const geo = "geo" in b ? cleanGeo(b.geo) : parse(m.geo, null);
  const scale = v("scale", (x) => { const n = Math.round(num(x) || 0); return n >= 500 && n <= 100000 ? n : null; });
  const area = v("area_km2", (x) => { const n = num(x); return n != null && n > 0 && n < 10000 ? Math.round(n * 100) / 100 : null; });
  return {
    country: v("country", (x) => (/^[A-Za-z]{2}$/.test(String(x || "")) ? String(x).toUpperCase() : "")),
    region: v("region", (x) => clean(x, 120)), dept: v("dept", (x) => clean(x, 120)),
    lat: ok ? Math.round(lat * 1e5) / 1e5 : null, lon: ok ? Math.round(lon * 1e5) / 1e5 : null,
    scale, area_km2: area,
    standard: v("standard", (x) => clean(x, 40)), surveyed: v("surveyed", year), revised: v("revised", year), mappers: v("mappers", (x) => clean(x, 300)),
    state: v("state", (x) => (STATES.includes(x) ? x : "current")),
    geo: geo ? JSON.stringify(geo) : null,
  };
}
const fileView = (f) => ({ name: f.name, size: f.size, type: f.type });
/** A map in the list: an embargoed map whose content the account may not see shows its name and end day only. */
function listView(m, A) {
  const may = { view: A.view, thumb: A.thumb, use: A.use, download: A.download, edit: A.edit, govern: A.govern };
  if (A.embargoed && !A.view && !A.edit) return { id: m.id, name: m.name, embargo: { until: m.embargo_until }, hidden: true, may };
  return { id: m.id, name: m.name, country: m.country, region: m.region, dept: m.dept, lat: m.lat, lon: m.lon, scale: m.scale, standard: m.standard,
    surveyed: m.surveyed, revised: m.revised, mappers: m.mappers, area_km2: m.area_km2, state: m.state, carto: m.carto_id || null, version: m.version,
    files: parse(m.files, []).map(fileView), rights: Object.keys(parse(m.rights, {})), embargo: embargoed(m) ? { until: m.embargo_until } : null,
    updated: m.updated_at, may };
}
function fullView(m, A) {
  const out = listView(m, A);
  if (out.hidden) return out;
  return { ...out, geo: parse(m.geo, null), rights: parse(m.rights, {}), embargo: m.embargo_until ? { until: m.embargo_until, note: m.embargo_note, ok: parse(m.embargo_ok, []), on: embargoed(m) } : null,
    access: (({ links, ...a }) => a)(parse(m.access, {})), created: m.created_at, org: m.org_id };
}
async function saveFiles(env, m, files) {
  const j = JSON.stringify(files), now = nowIso();
  await env.DB.batch([env.DB.prepare("UPDATE org_maps SET files = ?, updated_at = ? WHERE id = ?").bind(j, now, m.id),
    env.DB.prepare("UPDATE org_map_versions SET files = ? WHERE map_id = ? AND version = ?").bind(j, m.id, m.version)]);
}
async function names(env, ids) {
  const list = [...new Set(ids.filter((x) => Number.isInteger(Number(x)) && Number(x) > 0).map(Number))];
  if (!list.length) return {};
  const { results } = await env.DB.prepare(`SELECT id, first_name, last_name, display_name FROM users WHERE id IN (${list.map(() => "?").join(",")})`).bind(...list).all();
  return Object.fromEntries(results.map((u) => [u.id, nameOf(u)]));
}
async function serve(env, k, stamp) {
  const o = await env.BUCKET.get(k);
  if (!o) return json({ error: "not found" }, 404);
  return new Response(o.body, { headers: { "Content-Type": o.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "private, max-age=300", ETag: `"${String(stamp || "").replace(/\W/g, "")}"` } });
}
async function dropPrefix(env, prefix) {
  let cursor;
  do {
    const r = await env.BUCKET.list({ prefix, cursor, limit: 1000 });
    if (r.objects.length) await env.BUCKET.delete(r.objects.map((o) => o.key));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
}
/** A linked Cartographier document's card as its list keeps it (custom metadata: version, updated), or null when it is gone. */
async function cartoCard(env, id) {
  if (!/^[a-z0-9]{8,16}$/.test(String(id || ""))) return null;
  const h = await env.BUCKET.head(`mapper-meta/${id}.json`).catch(() => null);
  if (!h) return null;
  const c = h.customMetadata || {};
  return { version: Number(c.version) || 0, updated: c.updated || "", title: c.title || "" };
}
/** A map's name as a file's base name. */
const cartoName = (s) => String(s || "map").replace(/[\u0000-\u001f"<>|*?:\\/]+/g, "_").trim().slice(0, 100) || "map";
/** May the account open a Cartographier document (its owner, its team, a club group of its team)? */
async function cartoOpens(env, user, id) {
  if (!/^[a-z0-9]{8,16}$/.test(id)) return false;
  try {
    const meta = await (await env.BUCKET.get(`mapper-meta/${id}.json`))?.json();
    if (!meta) return false;
    if (Number(meta.owner) === user.id || (meta.team || []).some((x) => x.uid && Number(x.uid) === user.id)) return true;
    return await inGroups(env, user, meta.orgGroups);
  } catch (e) { return false; }
}

/** The maps the account may use in a tool, across its clubs. */
async function usable(env, user, tool) {
  if (!USES.includes(tool)) return [];
  const out = [];
  for (const mo of await orgsOf(env, user.id)) {
    const R = rightsOf(mo);
    if (!R.organise && !R.map && !R.manage) continue;
    const { results } = await env.DB.prepare("SELECT * FROM org_maps WHERE org_id = ? AND status = 'active' ORDER BY name COLLATE NOCASE").bind(mo.org.id).all();
    for (const m of results) {
      const A = await accessOf(env, user, m, R);
      if (!mayUse(A, m, tool)) continue;
      let files = parse(m.files, []).map(fileView), carto = null;
      if (m.carto_id) {
        // a Cartographier document: the browser writes it as an OCAD file (orgmapuse.js cartoFile), one virtual file here
        const c = await cartoCard(env, m.carto_id);
        if (!c) continue;
        carto = { id: m.carto_id, version: c.version };
        files = [{ name: `${cartoName(m.name)}.ocd`, size: 0, type: "application/x-ocad" }];
      }
      if (!files.length) continue;
      out.push({ org: mo.org.id, orgName: mo.org.name, id: m.id, name: m.name, version: m.version, files,
        scale: m.scale, standard: m.standard, lent: !A.download, thumb: A.thumb, ...(carto ? { carto } : {}) });
    }
  }
  return out;
}

/** A map shared by a link: its card; its viewing copy, thumbnail; its files when the link says so. */
async function shared(env, user, parts, method) {
  if (method !== "GET") return json({ error: "method" }, 405);
  const token = parts[0] || "";
  if (token.length < 20) return json({ error: "not found" }, 404);
  if (!(await allow(env, `orgmapslink:${user.id}`, 600, 3600))) return json({ error: "too many" }, 429);
  const h = await sha256hex(token);
  const { results } = await env.DB.prepare("SELECT * FROM org_maps WHERE status = 'active' AND instr(access, ?) > 0").bind(h).all();
  const m = results.find((x) => (parse(x.access, {}).links || []).some((l) => l.h === h && l.until >= parisToday()));
  if (!m) return json({ error: "not found" }, 404);
  const link = parse(m.access, {}).links.find((l) => l.h === h);
  const org = await orgById(env, m.org_id);
  if (!parts[1]) {
    return json({ map: { ...listView(m, { view: true, thumb: true, use: !!link.use, download: !!link.download }), org: m.org_id, orgName: org?.name || "" },
      link: { until: link.until, download: !!link.download, use: !!link.use } });
  }
  if (parts[1] === "view" || parts[1] === "thumb") return serve(env, key(m.org_id, m.id, parts[1]), m.updated_at);
  if (parts[1] === "file" && link.download) {
    const name = fileName(decodeURIComponent(parts.slice(2).join("/")));
    const f = parse(m.files, []).find((x) => x.name === name);
    const o = f ? await env.BUCKET.get(f.key) : null;
    if (!o) return json({ error: "not found" }, 404);
    return new Response(o.body, { headers: { "Content-Type": o.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}` } });
  }
  return json({ error: "forbidden" }, 403);
}
