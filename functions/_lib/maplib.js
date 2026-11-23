// The administrators' map collection (owner, 2026-11-06: « a special admin map library … all maps that go to Ozimut; avoid
// saving the same map multiple times, always using the best quality map, and the latest one, for a given location »).
// Every map an account sends to Ozimut — « Analyse solo »'s kept analyses (solo/<uid>/m/<sha>), the organisers' map analyses
// (analyses/<id>/map-<n>) and the Tracer's events' maps (tracer/<id>/map, never an encrypted event's, never its courses) — is
// copied once into R2 (cn-state), unless its owner marked it « Carte privée » when sending it (owner, 2026-11-06, second rule:
// off by default; Solo's box beside « Enregistrer l'analyse », the Tracer's map dialogs — a map marked so after it was copied
// leaves the collection at the next step, unless an unmarked source holds the same image):
//   admin-maps/m/<etag>   the map as it came (its R2 etag — the MD5 of its bytes — as its name: the same image sent to Solo and
//                         to an analysis is kept once), what it is in the object's custom metadata (below), one R2 list
//   admin-maps/t/<etag>   its thumbnail (the source's, else made by an administrator's browser);  admin-maps/v/<etag>  its
//                         viewing copy (made by the browser, as « Mes cartes »')
//   admin-maps/x/<etag>   a map left out: another of the same place replaced it (`by`) — so that it is not copied again
//   admin-maps/in/<uid>-<ms>.json   a deleted account's maps handed over (below), until copied
//   admin-maps/placed.json   the day each map without a place was last looked at again (`placeLater`)
// One place, one map: maps whose centres lie within a quarter of the smaller one's extent (200 m when an extent is unknown),
// of extents within 1.5 times, are one place; the latest (its event's day, else the day it came) is kept, or, among those
// within 60 days of it, the one of most pixels — the best quality. « Mes cartes »' own maps are not copied while their account
// lives: the collection's page shows them from the accounts' libraries (functions/api/admin/maplib.js).
// A deleted account's maps stay (owner, 2026-11-06: « retain the maps in all cases, if making them visible to admins has not
// been disallowed »): its « Mes cartes », Solo and ownerless Tracer maps not marked private are handed over (`handOver`: the
// sources kept until the next steps copy them, then deleted), and the collection's maps lose its name and account (`forgetUser`);
// its runs, comments and courses go.
// A club's maps (docs/clubs/design.md §2, _lib/orgmaps.js) never enter it: a Tracer's event on a club map is marked private
// (api/tracer's summary), and an analysis circuit drawn on one (its `orgMap`) is left out once and for all (an x/ record).
// A sync step copies a few maps at a time (`budget`): from /api/track at most every 30 minutes an isolate, so that a map
// deleted soon after it came is kept, and from the collection's page until nothing is left.
import { clubLabel } from "./club.js";

export const PFX = "admin-maps/";
const M = `${PFX}m/`, X = `${PFX}x/`, T = `${PFX}t/`, V = `${PFX}v/`, IN = `${PFX}in/`, PLACED = `${PFX}placed.json`;
export const keys = { map: (e) => `${M}${e}`, thumb: (e) => `${T}${e}`, view: (e) => `${V}${e}`, gone: (e) => `${X}${e}` };
const RAD = Math.PI / 180;
const km = (a, b) => { const dl = (b[0] - a[0]) * RAD, dn = (b[1] - a[1]) * RAD, s = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * RAD) * Math.cos(b[0] * RAD) * Math.sin(dn / 2) ** 2; return 12742 * Math.asin(Math.sqrt(s)); };
const s = (v) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, 300);

export async function listAll(env, prefix, meta = true) {
  const out = [];
  let cursor;
  do {
    const r = await env.BUCKET.list({ prefix, cursor, limit: 1000, include: meta ? ["customMetadata", "httpMetadata"] : undefined });
    out.push(...r.objects);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}
const tail = (k) => k.slice(k.lastIndexOf("/") + 1);
const etagOf = (o) => String(o.etag || "").replace(/"/g, "");

/** (lon, lat) → px (or mm) affine `g` inverted at (x, y): [lat, lon]. */
function latLon(g, x, y) {
  const det = g.a * g.e - g.b * g.d;
  if (!det) return null;
  const X = x - g.c, Y = y - g.f, lon = (g.e * X - g.b * Y) / det, lat = (-g.d * X + g.a * Y) / det;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && Math.abs(lat) + Math.abs(lon) > 0.1 ? [lat, lon] : null;
}
/** A map's centre and extent (its diagonal, km) from a georeference over w × h (pixels or mm). */
export function placeOf(g, w, h, centre = null) {
  if (!g || !(w > 0) || !(h > 0)) return {};
  const c = centre ? latLon(g, centre[0], centre[1]) : latLon(g, w / 2, h / 2), a = latLon(g, 0, 0), b = latLon(g, w, h);
  return c ? { pos: `${c[0].toFixed(5)},${c[1].toFixed(5)}`, ext: a && b ? km(a, b).toFixed(2) : "" } : {};
}

/** Each Solo map of an account: { "<uid>/<sha>": { latest analysis summary, runs, priv } }. */
function soloMaps(objects) {
  const out = new Map();
  for (const o of objects) {
    const m = /^solo\/(\d+)\/a\/[^/]+\.json$/.exec(o.key);
    if (!m) continue;
    let a = null;
    try { a = JSON.parse(o.customMetadata?.s || "null"); } catch (e) { /* none */ }
    if (!a?.sha) continue;
    const k = `${m[1]}/${a.sha}`, old = out.get(k);
    const priv = !!a.priv || !!old?.priv, runs = (old?.runs || 0) + 1;
    out.set(k, !old || String(a.updated || "") > String(old.updated || "") ? { ...a, runs, priv } : { ...old, runs, priv });
  }
  return out;
}

// ---- the sources ----------------------------------------------------------------------------------------------------
/**
 * The maps of Solo, the analyses and the Tracer: { todo: those not held nor left out, not private ([{ etag, key, thumb, uid,
 * info() → custom metadata }]), priv: the etags of the private ones, pub: the etags of the others }. `info` reads what the listing
 * does not give (an analysis's or an event's own record) only for a map to copy.
 */
async function sources(env, seen) {
  const todo = [], priv = new Set(), pub = new Set(), all = new Map();
  const note = (etag, isPriv) => (isPriv ? priv : pub).add(etag);
  // every public source by its etag (`all`: a map already held is described again when it had no place); the new ones to copy
  const offer = (c) => { all.set(c.etag, c); if (!seen.has(c.etag)) todo.push(c); };
  // Analyse solo: each account's maps, named by their SHA-256, described by the analyses that use them
  const solo = await listAll(env, "solo/");
  const soloMeta = soloMaps(solo);
  for (const o of solo) {
    const m = /^solo\/(\d+)\/m\/([0-9a-f]{64})$/.exec(o.key);
    if (!m) continue;
    const a = soloMeta.get(`${m[1]}/${m[2]}`) || {}, e = etagOf(o);
    note(e, a.priv);
    if (a.priv) continue;
    offer({ etag: e, key: o.key, thumb: `${o.key}.thumb`, uid: m[1],
      info: async () => ({ src: "solo", uid: m[1], title: s(a.title), day: s(a.day || (a.created || "").slice(0, 10)), runs: String(a.runs || 0),
        w: String(a.w || ""), h: String(a.h || ""), ...placeOf(a.geo, a.w, a.h) }) });
  }
  // the organisers' map analyses: each circuit's map (published to their runners: never private)
  const metas = new Map((await listAll(env, "analyses-meta/")).map((o) => [o.customMetadata?.id || tail(o.key).replace(/\.json$/, ""), o.customMetadata || {}]));
  for (const o of await listAll(env, "analyses/", false)) {
    const m = /^analyses\/([^/]+)\/map-(\d+)$/.exec(o.key);
    if (!m || !metas.has(m[1])) continue;
    const e = etagOf(o);
    note(e, false);
    const sm = metas.get(m[1]);
    offer({ etag: e, key: o.key, thumb: `analyses/${m[1]}/thumb-${m[2]}`, uid: sm.owner,
      info: async () => {
        let full = null;
        try { full = await (await env.BUCKET.get(`analyses-meta/${m[1]}.json`))?.json(); } catch (err) { /* the summary's */ }
        const c = (full?.courses || []).find((x) => x.n === Number(m[2])) || (full?.courses || [])[Number(m[2])] || {};
        if (c.orgMap) return null;                      // a club's map: never the administrators' (docs/clubs/design.md §2)
        return { src: "analysis", ref: m[1], uid: s(sm.owner), user: s(sm.ownerName), title: s([sm.title, c.name].filter(Boolean).join(" · ")), day: s(sm.date),
          club: s(sm.orgName), w: String(c.map?.w || ""), h: String(c.map?.h || ""), ...placeOf(c.geo, c.map?.w, c.map?.h) };
      } });
  }
  // the Tracer's events: the map as it came — not an encrypted event's (the server cannot read it), never the courses
  for (const o of await listAll(env, "tracer-meta/")) {
    const sm = o.customMetadata || {};
    if (sm.enc === "1" || !sm.id) continue;
    const h = await env.BUCKET.head(`tracer/${sm.id}/map`);
    if (!h) continue;
    const e = etagOf(h);
    note(e, sm.priv === "1");
    if (sm.priv === "1") continue;
    offer({ etag: e, key: h.key, thumb: null, uid: sm.owner, info: () => tracerInfo(env, sm) });
  }
  return { todo, priv, pub, all };
}
/** An event's map described: its title and day, its organiser, and its place from the georeference (its controls' centroid). */
export async function tracerInfo(env, sm) {
  let ev = null;
  try { const e = await env.BUCKET.get(`tracer/${sm.id}/event`); const txt = e ? await e.text() : ""; if (txt.startsWith("{")) ev = JSON.parse(txt); } catch (err) { /* none */ }
  let place = {};
  if (ev?.geo && ev.map?.w) {
    const cs = Object.values(ev.controls || {}).filter((c) => Number.isFinite(c?.x) && Number.isFinite(c?.y));
    const centre = cs.length ? [cs.reduce((t, c) => t + c.x, 0) / cs.length, cs.reduce((t, c) => t + c.y, 0) / cs.length] : null;
    place = placeOf(ev.geo, ev.map.w, ev.map.h, centre);
  }
  return { src: "tracer", ref: s(sm.id), uid: s(sm.owner), user: s(sm.ownerName), title: s(sm.title), day: s(sm.date), club: s(sm.orgClub),
    name: s(ev?.map?.file || ""), kind: s(ev?.map?.kind || ""), ...place };
}

/** Copy an R2 object (streamed: up to 80 MB without holding it). */
async function copy(env, from, to, customMetadata) {
  const o = await env.BUCKET.get(from);
  if (!o) return false;
  const { readable, writable } = new FixedLengthStream(o.size);
  const done = o.body.pipeTo(writable);
  await env.BUCKET.put(to, readable, { httpMetadata: o.httpMetadata, customMetadata });
  await done;
  return true;
}
const clean = (meta) => { for (const k of Object.keys(meta)) if (meta[k] === "" || meta[k] == null) delete meta[k]; return meta; };

/** Accounts' names and clubs: { uid: { name, club } } (the club as the results write it, France's licensees only). */
async function people(env, request, uids) {
  const ids = [...new Set(uids.filter((u) => /^\d+$/.test(String(u))).map(Number))];
  const out = {};
  if (!ids.length) return out;
  const { results } = await env.DB.prepare(`SELECT id, first_name, last_name, display_name, licence FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all();
  for (const u of results) {
    out[u.id] = { name: `${String(u.first_name || "").trim()} ${String(u.last_name || "").trim()}`.trim() || u.display_name || "",
      club: request && u.licence ? (await clubLabel(env, request, u.licence).catch(() => null)) || "" : "" };
  }
  return out;
}

/**
 * One step: up to `budget` maps copied — a deleted account's handed over first —, the maps now private taken out, then — when
 * none is left — one place, one map. -> { copied, left, gone }. request: for the clubs (read from the site's data).
 */
export async function syncStep(env, request, { budget = 4 } = {}) {
  const held = await listAll(env, M), goneList = await listAll(env, X, false);
  const seen = new Set([...held.map((o) => tail(o.key)), ...goneList.map((o) => tail(o.key))]);
  let copied = 0, room = budget;
  // a deleted account's maps
  for (const f of await listAll(env, IN, false)) {
    if (room <= 0) break;
    const list = await (await env.BUCKET.get(f.key))?.json().catch(() => null) || [];
    while (list.length && room > 0) {
      const x = list.shift();
      let src = null;
      for (const k of x.keys || []) { src = await env.BUCKET.head(k); if (src) break; }
      if (src) {
        const e = etagOf(src);
        if (!seen.has(e)) {
          if (await copy(env, src.key, keys.map(e), clean({ ...x.meta, up: new Date().toISOString().slice(0, 10), from: "deleted" }))) {
            copied++; room--; seen.add(e);
            if (x.thumb) await copy(env, x.thumb, keys.thumb(e), {}).catch(() => false);
            if (x.view) await copy(env, x.view, keys.view(e), {}).catch(() => false);
          }
        }
      }
      await env.BUCKET.delete([...(x.keys || []), x.thumb, x.view].filter(Boolean));
    }
    if (list.length) await env.BUCKET.put(f.key, JSON.stringify(list), { httpMetadata: { contentType: "application/json" } });
    else await env.BUCKET.delete(f.key);
  }
  const { todo, priv, pub, all } = await sources(env, seen);
  // marked private since it was copied (and no unmarked source holds the same image): out of the collection
  for (const o of held) {
    const e = tail(o.key);
    if (priv.has(e) && !pub.has(e) && o.customMetadata?.from !== "deleted") await env.BUCKET.delete([keys.map(e), keys.thumb(e), keys.view(e)]);
  }
  const pick = todo.slice(0, Math.max(0, room));
  const who = await people(env, request, pick.map((c) => c.uid));
  for (const c of pick) {
    const info = await c.info();
    if (!info) { await env.BUCKET.put(keys.gone(c.etag), "", { customMetadata: { by: "club" } }); continue; }   // a club's map: left out
    const p = who[info.uid] || {};
    const meta = clean({ ...info, user: info.user || s(p.name), club: info.club || s(p.club), up: new Date().toISOString().slice(0, 10), from: c.key });
    if (await copy(env, c.key, keys.map(c.etag), meta)) {
      copied++;
      if (c.thumb) await copy(env, c.thumb, keys.thumb(c.etag), {}).catch(() => false);
    }
  }
  await placeLater(env, held, all, Math.max(2, room - pick.length));
  const left = todo.length - pick.length + (await listAll(env, IN, false)).length;
  const gone = left ? 0 : await onePerPlace(env);
  return { copied, left, gone };
}

/**
 * A map copied before it was georeferenced (an analysis's circuit placed after its map was sent, a Tracer event georeferenced
 * later: the copy keeps the image's etag, so it is never copied again) gets its place from its source once it has one; each map
 * without a place is looked at again once a day at most (admin-maps/placed.json: { etag: day }), `n` a step.
 */
async function placeLater(env, held, all, n) {
  const day = new Date().toISOString().slice(0, 10);
  const done = (await (await env.BUCKET.get(PLACED))?.json().catch(() => null)) || {};
  const due = held.filter((o) => !o.customMetadata?.pos && all.has(tail(o.key)) && done[tail(o.key)] !== day).slice(0, n);
  if (!due.length) return;
  for (const o of due) {
    const e = tail(o.key);
    done[e] = day;
    const info = await all.get(e).info().catch(() => null);
    if (info?.pos) await copy(env, o.key, o.key, clean({ ...o.customMetadata, pos: info.pos, ext: info.ext, w: o.customMetadata?.w || info.w, h: o.customMetadata?.h || info.h }));
  }
  const live = new Set(held.map((o) => tail(o.key)));
  for (const e of Object.keys(done)) if (!live.has(e)) delete done[e];
  await env.BUCKET.put(PLACED, JSON.stringify(done), { httpMetadata: { contentType: "application/json" } });
}

/** One place, one map: the others of a place are left out (their copies deleted, a record kept). -> how many. */
async function onePerPlace(env) {
  const items = (await listAll(env, M)).map((o) => {
    const m = o.customMetadata || {}, p = String(m.pos || "").split(",").map(Number);
    return { etag: tail(o.key), m, pos: p.length === 2 && p.every(Number.isFinite) ? p : null, ext: Number(m.ext) || 0,
      day: m.day || m.up || "", px: (Number(m.w) || 0) * (Number(m.h) || 0) || o.size };
  }).filter((x) => x.pos);
  const near = (a, b) => {
    const d = km(a.pos, b.pos);
    if (a.ext && b.ext) return Math.max(a.ext, b.ext) / Math.min(a.ext, b.ext) <= 1.5 && d <= Math.min(a.ext, b.ext) / 4;
    return d <= 0.2;
  };
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (near(items[i], items[j])) parent[find(i)] = find(j);
  const groups = new Map();
  items.forEach((x, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(x); });
  let gone = 0;
  const dayMs = (d) => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`) || 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const latest = Math.max(...g.map((x) => dayMs(x.day)));
    const keep = g.filter((x) => latest - dayMs(x.day) <= 60 * 864e5).sort((a, b) => b.px - a.px || dayMs(b.day) - dayMs(a.day))[0];
    for (const x of g) {
      if (x === keep) continue;
      await env.BUCKET.put(keys.gone(x.etag), "", { customMetadata: clean({ by: keep.etag, title: x.m.title || "", src: x.m.src || "", uid: x.m.uid || "", user: x.m.user || "", day: x.day }) });
      await env.BUCKET.delete([keys.map(x.etag), keys.thumb(x.etag), keys.view(x.etag)]);
      gone++;
    }
  }
  return gone;
}

let lastSync = 0;
/** From /api/track: a small step at most every 30 minutes an isolate (a map deleted soon after it came is kept). */
export function maplibSoon(ctx) {
  if (!ctx.env.BUCKET || Date.now() - lastSync < 30 * 60e3) return;
  lastSync = Date.now();
  ctx.waitUntil(syncStep(ctx.env, ctx.request, { budget: 2 }).catch((e) => console.error("maplib", e)));
}

// ---- an account deleted ----------------------------------------------------------------------------------------------------
/**
 * Its maps handed over to the collection: [{ keys: [the original's key, an older one…], thumb, view, meta }] — kept in R2 until
 * the sync steps copy them (then deleted). The caller leaves those objects in place. meta: what the map is, without the
 * account's name or number.
 */
export async function handOver(env, uid, list) {
  if (!list.length) return;
  await env.BUCKET.put(`${IN}${uid}-${Date.now()}.json`, JSON.stringify(list), { httpMetadata: { contentType: "application/json" } });
}
/** The account's Solo maps not marked private, as handOver wants them; with the keys to leave in place. */
export async function soloHandOver(env, uid) {
  const objs = await listAll(env, `solo/${uid}/`);
  const meta = soloMaps(objs), list = [], keep = new Set();
  for (const o of objs) {
    const m = /^solo\/(\d+)\/m\/([0-9a-f]{64})$/.exec(o.key);
    const a = m && meta.get(`${m[1]}/${m[2]}`);
    if (!m || !a || a.priv) continue;
    list.push({ keys: [o.key], thumb: `${o.key}.thumb`, meta: clean({ src: "solo", title: s(a.title), day: s(a.day), w: String(a.w || ""), h: String(a.h || ""), ...placeOf(a.geo, a.w, a.h) }) });
    keep.add(o.key); keep.add(`${o.key}.thumb`);
  }
  return { list, keep };
}
/** The collection's maps lose the deleted account's name and number (their metadata written again; the image stays). */
export async function forgetUser(env, uid) {
  for (const o of await listAll(env, M)) {
    const m = o.customMetadata || {};
    if (m.uid !== String(uid)) continue;
    const { user, uid: _u, ...rest } = m;
    await copy(env, o.key, o.key, rest);
  }
  for (const o of await listAll(env, X)) {
    const m = o.customMetadata || {};
    if (m.uid !== String(uid)) continue;
    const { user, uid: _u, ...rest } = m;
    await env.BUCKET.put(o.key, "", { customMetadata: rest });
  }
}
