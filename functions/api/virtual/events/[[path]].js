// /api/virtual/events/… — « Virtually »'s events (Coach › Virtually › Orga; owner, 2026-11-11): an organiser makes a virtual race
// from their own OCAD map (an administrator also from the LiDAR alone, without a map), as a training or a competition.
//   GET    events                         the events this visitor or account may see: the published ones (trainings to
//                                         everyone, visitors without an account too; competitions to accounts), and an
//                                         account's own (any state; an administrator: all) — [{ id, name, type, … , played }]
//   GET    events/<id>                    one event; its organisers also get its build's progress
//   POST   events { name, type, from, to, source, courses, area }   a new event (a draft); source "ocad" or "lidar"
//                                         (administrators: area { lat, lon, size } in metres), courses "proposed" or "file"
//   PUT    events/<id> { name, type, from, to, published, env, mapOpt }      its settings; env { weather, time, lamp } the race's
//                                         conditions (owner, 2026-11-12: clear | overcast | rain | fog | snow; day | dusk | night;
//                                         a night's headlamp normal | strong), drawn by games/vweather.js
//   PUT    events/<id>/file/<map.ocd|courses.ocd|courses.xml>        the organiser's files (the body), kept privately in R2
//   POST   events/<id>/build              the race package made by the workflow virtually.yml (GH_DISPATCH_TOKEN)
//   DELETE events/<id>                    the event, its files, its package and its runs
//   GET    events/<id>/pkg/<file>         its package (as virtual/<race>/ for the built-in maps), to whoever may play it
//   GET    events/<id>/runs               its results: [{ course, name, t, sp, d, at, help, mine }]
//   POST   events/<id>/runs { course, t, sp, d, help, seed, route }   a run: a training's as often as one likes, a
//                                         competition's once per account and course (409 « already run »), within its dates
// Storage, R2 only (cn-state): virtual-events/<id>.json (the event; its summary in custom metadata, one list for the events),
// virtual-events/<id>/<file> (the organiser's files: never served), virtual-ev/<id>/<file> (the package the workflow makes),
// virtual-build/<id>.json (a build asked for, its progress written by the workflow), and the runs as the built-in maps' runs
// (api/virtual: virtual-runs/<event id>/<course>/<hash>-<time>.json, kind and event in custom metadata), so that the results
// and the ranking read them all; only competitions count in the ranking.
import { allow, currentUser, isAdmin, json, nowIso, readBody } from "../../../_lib/api.js";
import { runnerHash } from "../../../_lib/virtual.js";

const EV = "virtual-events/", PKG = "virtual-ev/", REQ = "virtual-build/", RUNS = "virtual-runs/";
const ID = /^e[a-z0-9]{9}$/, COURSE = /^[a-z0-9_]{1,24}$/;
const PFILES = /^(race\.json|h\.png|cls\.png|veg\.png|ground\.jpg|feats\.json|trees\.bin|map\.ocd|map\.ocd\.gz|map\.webp|thumb\.webp)$/;
const INPUTS = { "map.ocd": 40e6, "courses.ocd": 40e6, "courses.xml": 5e6 };
const TYPES = { json: "application/json", png: "image/png", jpg: "image/jpeg", webp: "image/webp", bin: "application/octet-stream", ocd: "application/octet-stream", gz: "application/gzip" };
const MAX_EVENTS = 20;                       // an account's events (an administrator: no limit)

const isOrganiser = (env, user, ev) => !!user && (ev.by === user.id || isAdmin(env, user));
const today = () => new Date().toISOString().slice(0, 10);
/** Is the competition open today (its dates, when it has some)? */
const openNow = (ev) => (!ev.from || ev.from <= today()) && (!ev.to || today() <= ev.to);
/** May this visitor (user null) or account play the event? */
function mayPlay(env, user, ev) {
  if (isOrganiser(env, user, ev)) return true;
  if (!ev.published || !(ev.courses || []).length) return false;   // published and built once: a rebuild keeps it playable
  return ev.type === "training" || !!user;
}
/** What everyone may know of an event (never who made it, beyond the name shown). */
const view = (ev, extra = {}) => ({ id: ev.id, name: ev.name, type: ev.type, from: ev.from || "", to: ev.to || "", source: ev.source,
  status: ev.status, published: !!ev.published, org: ev.orgName || "", courses: ev.courses || [], std: ev.std || "", scale: ev.scale || 0,
  lonlat: ev.lonlat || null, thumb: !!ev.thumb, open: ev.type === "training" || openNow(ev), env: cleanEnv(ev.env), mapOpt: cleanMapOpt(ev.mapOpt, ev), ...extra });

async function getEvent(env, id) {
  if (!ID.test(id || "")) return null;
  const o = await env.BUCKET.get(`${EV}${id}.json`);
  return o ? o.json() : null;
}
async function putEvent(env, ev) {
  ev.updated = nowIso();
  await env.BUCKET.put(`${EV}${ev.id}.json`, JSON.stringify(ev), { httpMetadata: { contentType: "application/json" },
    customMetadata: { by: String(ev.by), t: ev.type, s: ev.status, p: ev.published ? "1" : "0" } });
}
async function listAll(env, prefix, opts = {}) {
  const out = []; let cursor;
  do {
    const r = await env.BUCKET.list({ prefix, cursor, limit: 1000, ...opts });
    out.push(...r.objects); cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}
const userOf = async (ctx) => (ctx.env.DB ? currentUser(ctx.request, ctx.env) : null);
/** The race's conditions, as games/vweather.js knows them (anything else: a clear day). */
function cleanEnv(e) {
  const pick = (v, list) => (list.includes(v) ? v : list[0]);
  return { weather: pick(e?.weather, ["clear", "overcast", "rain", "fog", "snow"]), time: pick(e?.time, ["day", "dusk", "night"]),
    lamp: pick(e?.lamp, ["normal", "strong"]) };
}
/** The map options its creator fixed (games/vmapopt.js; the same for every runner): { layer, memory }; a race from the LiDAR alone
 *  (its map an image without symbols) keeps « map at the controls only » alone. */
function cleanMapOpt(o, ev) {
  const layer = ["full", "nopaths", "noveg", "relief", "contours"].includes(o?.layer) && ev?.source !== "lidar" ? o.layer : "full";
  return { layer, memory: o?.memory === true };
}
/** A run's code of them, « nopaths+mem » ("" the whole map). */
const moCode = (o) => [o.layer !== "full" ? o.layer : "", o.memory ? "mem" : ""].filter(Boolean).join("+");
const cleanName = (s) => String(s || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 80);
const cleanDate = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? String(s) : "");

/** The workflow started (GitHub workflow_dispatch); false without the token. */
async function startBuild(env) {
  if (!env.GH_DISPATCH_TOKEN) return false;
  const r = await fetch(`https://api.github.com/repos/${env.GH_REPO || "kerkia/Ozimut"}/actions/workflows/virtually.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ozimut-virtually", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main" }),
  });
  return r.status === 204;
}

/** The courses an account already ran in a competition: { course: true }. */
async function played(env, user, id) {
  if (!user) return [];
  const u = await runnerHash(env, user.id), out = new Set();
  for (const o of await listAll(env, `${RUNS}${id}/`, { include: ["customMetadata"] })) {
    if (o.key.split("/").pop().startsWith(`${u}-`) && o.customMetadata?.k === "competition") out.add(o.key.split("/")[2]);
  }
  return [...out];
}

export async function onRequestGet(ctx) {
  const { request, env, params } = ctx;
  if (!env.BUCKET) return json({ error: "storage not configured" }, 500);
  const user = await userOf(ctx), path = [].concat(params.path || []);
  if (!path.length) {
    // every record read (a few dozen events): what each says decides, not a summary that a build might not have written
    const objs = (await listAll(env, EV)).filter((o) => /^virtual-events\/e[a-z0-9]{9}\.json$/.test(o.key));
    const evs = (await Promise.all(objs.map((o) => getEvent(env, o.key.slice(EV.length, -5)))))
      .filter((ev) => ev && (isOrganiser(env, user, ev) || mayPlay(env, user, ev)));
    const out = await Promise.all(evs.map(async (ev) => view(ev, { mine: isOrganiser(env, user, ev),
      played: ev.type === "competition" ? await played(env, user, ev.id) : [] })));
    out.sort((a, b) => (b.from || "").localeCompare(a.from || "") || a.name.localeCompare(b.name));
    return json({ events: out, admin: !!user && isAdmin(env, user) }, 200, { "Cache-Control": "private, no-store" });
  }
  const ev = await getEvent(env, path[0]);
  if (!ev) return json({ error: "not found" }, 404);
  if (!mayPlay(env, user, ev)) return json({ error: user ? "forbidden" : "login required" }, user ? 403 : 401);
  if (path.length === 1) {
    const extra = { mine: isOrganiser(env, user, ev), played: ev.type === "competition" ? await played(env, user, ev.id) : [] };
    if (extra.mine) {
      const req = await env.BUCKET.get(`${REQ}${ev.id}.json`);
      extra.build = req ? await req.json().catch(() => null) : null;
      extra.error = ev.error || "";
      extra.files = Object.fromEntries(await Promise.all(Object.keys(INPUTS).map(async (f) => [f, (await env.BUCKET.head(`${EV}${ev.id}/${f}`))?.size || 0])));
      extra.area = ev.area || null; extra.coursesFrom = ev.coursesFrom || "proposed";
      extra.lidarOcd = !!ev.lidarOcd; extra.edited = !!ev.edited;
    }
    return json(view(ev, extra), 200, { "Cache-Control": "private, no-store" });
  }
  // the generated map as an OCAD file (a race from the LiDAR alone), for its organisers to edit before building again
  if (path[1] === "file" && path.length === 3 && path[2] === "lidar.ocd") {
    if (!isOrganiser(env, user, ev)) return json({ error: "forbidden" }, 403);
    const o = await env.BUCKET.get(`${EV}${ev.id}/lidar.ocd`);
    if (!o) return json({ error: "not found" }, 404);
    const name = `${ev.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim().replace(/\s+/g, "-") || ev.id}-lidar.ocd`;
    return new Response(o.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` } });
  }
  if (path[1] === "pkg" && path.length === 3 && PFILES.test(path[2])) {
    const key = `${PKG}${ev.id}/${path[2]}`, etag = request.headers.get("If-None-Match");
    const o = await env.BUCKET.get(key, etag ? { onlyIf: { etagDoesNotMatch: etag.replace(/"/g, "") } } : undefined);
    if (!o) return json({ error: "not found" }, 404);
    const headers = { "Content-Type": TYPES[path[2].split(".").pop()], "Cache-Control": "private, max-age=600", ETag: `"${o.etag}"` };
    if (!("body" in o) || !o.body) return new Response(null, { status: 304, headers });
    return new Response(o.body, { headers });
  }
  if (path[1] === "runs" && path.length === 2) {
    const me = user ? await runnerHash(env, user.id) : "";
    const runs = (await listAll(env, `${RUNS}${ev.id}/`, { include: ["customMetadata"] })).map((o) => {
      const m = o.customMetadata || {}, parts = o.key.slice(RUNS.length).split("/");
      return { id: parts[2].replace(/\.json$/, ""), course: parts[1], name: m.n || "", t: Number(m.t), d: Number(m.d) || 0,
        sp: String(m.sp || "").split(",").filter(Boolean).map(Number), at: m.at || "", help: m.h === "1", kind: m.k || "training", mo: m.mo || "", mine: !!me && m.u === me };
    }).filter((r) => Number.isFinite(r.t));
    return json({ runs }, 200, { "Cache-Control": "private, no-store" });
  }
  return json({ error: "bad request" }, 400);
}

export async function onRequestPost(ctx) {
  const { request, env, params } = ctx;
  if (!env.BUCKET) return json({ error: "storage not configured" }, 500);
  const user = await userOf(ctx);
  if (!user) return json({ error: "login required" }, 401);
  if (user.demo_until) return json({ error: "demo" }, 403);
  const path = [].concat(params.path || []), admin = isAdmin(env, user);
  if (!path.length) {                                    // a new event
    if (!(await allow(env, `vevent:${user.id}`, admin ? 200 : 20, 86400))) return json({ error: "rate" }, 429);
    const b = await readBody(request);
    const source = b?.source === "lidar" ? "lidar" : "ocad";
    if (source === "lidar" && !admin) return json({ error: "forbidden" }, 403);
    if (!admin) {
      const n = (await listAll(env, EV, { include: ["customMetadata"] })).filter((o) => String(o.customMetadata?.by) === String(user.id)).length;
      if (n >= MAX_EVENTS) return json({ error: "too many events", max: MAX_EVENTS }, 429);
    }
    const name = cleanName(b?.name);
    if (!name) return json({ error: "name" }, 400);
    let area = null;
    if (source === "lidar") {
      const lat = Number(b?.area?.lat), lon = Number(b?.area?.lon), size = Math.round(Number(b?.area?.size) || 2000);
      if (!(Math.abs(lat) <= 85 && Math.abs(lon) <= 180) || !(size >= 800 && size <= 3000)) return json({ error: "area" }, 400);
      area = { lat, lon, size };
    }
    const id = `e${Date.now().toString(36).slice(-6)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 10).padEnd(10, "0");
    const ev = { id, name, type: b?.type === "competition" ? "competition" : "training", from: cleanDate(b?.from), to: cleanDate(b?.to),
      source, area, coursesFrom: b?.courses === "file" && source === "ocad" ? "file" : "proposed", env: cleanEnv(b?.env),
      mapOpt: cleanMapOpt(b?.mapOpt, { source }), by: user.id,
      orgName: String(user.display_name || "").slice(0, 80), created: nowIso(), status: "draft", published: false, courses: [] };
    await putEvent(env, ev);
    return json(view(ev, { mine: true, files: {}, area, coursesFrom: ev.coursesFrom }));
  }
  const ev = await getEvent(env, path[0]);
  if (!ev) return json({ error: "not found" }, 404);
  if (path[1] === "build" && path.length === 2) {
    if (!isOrganiser(env, user, ev)) return json({ error: "forbidden" }, 403);
    if (ev.source === "ocad" && !(await env.BUCKET.head(`${EV}${ev.id}/map.ocd`))) return json({ error: "no map" }, 400);
    if (ev.coursesFrom === "file" && !(await env.BUCKET.head(`${EV}${ev.id}/courses.ocd`)) && !(await env.BUCKET.head(`${EV}${ev.id}/courses.xml`))
      && !(await env.BUCKET.head(`${EV}${ev.id}/map.ocd`))) return json({ error: "no courses" }, 400);
    if (!(await allow(env, `vbuild:${user.id}`, admin ? 50 : 6, 86400))) return json({ error: "rate" }, 429);
    const req = { id: ev.id, source: ev.source, area: ev.area, courses: ev.coursesFrom, at: nowIso(), stage: "queued", frac: 0 };
    await env.BUCKET.put(`${REQ}${ev.id}.json`, JSON.stringify(req), { httpMetadata: { contentType: "application/json" } });
    ev.status = "queued"; ev.error = "";
    await putEvent(env, ev);
    const started = await startBuild(env).catch(() => false);
    return json({ ok: true, started });
  }
  if (path[1] === "runs" && path.length === 2) {
    if (!mayPlay(env, user, ev)) return json({ error: "forbidden" }, 403);
    const organiser = isOrganiser(env, user, ev);
    if (ev.type === "competition" && !organiser && !openNow(ev)) return json({ error: "closed" }, 403);
    if (!(await allow(env, `virtual:${user.id}`, 60, 3600))) return json({ error: "rate" }, 429);
    const b = await readBody(request);
    const course = String(b?.course || ""), t = Number(b?.t), sp = Array.isArray(b?.sp) ? b.sp.map(Number) : [];
    if (!COURSE.test(course) || !(ev.courses || []).some((c) => c.id === course)) return json({ error: "bad request" }, 400);
    if (!(t > 0 && t < 86400) || sp.length > 60 || !sp.every((x) => x >= 0 && x <= t + 1)) return json({ error: "bad request" }, 400);
    const u = await runnerHash(env, user.id);
    // a competition: once per account and course — the organisers' own test runs are trainings
    const kind = ev.type === "competition" && !organiser ? "competition" : "training";
    if (kind === "competition") {
      const mine = await listAll(env, `${RUNS}${ev.id}/${course}/${u}-`, { include: ["customMetadata"] });
      if (mine.some((o) => o.customMetadata?.k === "competition")) return json({ error: "already run" }, 409);
    }
    const route = (Array.isArray(b?.route) ? b.route : []).slice(0, 22000)
      .filter((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)).map(([a, x, z]) => [Math.round(a * 10) / 10, Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
    const id = `${u}-${Date.now().toString(36)}`, at = nowIso(), seed = Number(b?.seed), d = Number(b?.d);
    const meta = { u, n: String(user.display_name || "").slice(0, 80), t: String(Math.round(t * 10) / 10), sp: sp.map((x) => Math.round(x * 10) / 10).join(","),
      at, h: b?.help ? "1" : "0", d: Number.isFinite(d) ? String(Math.round(d)) : "0", s: seed > 0 && seed < 20000 ? String(Math.round(seed)) : "", k: kind, e: ev.id };
    const mo = moCode(cleanMapOpt(ev.mapOpt, ev));         // the event's own options, whatever the page sent
    if (mo) meta.mo = mo;
    await env.BUCKET.put(`${RUNS}${ev.id}/${course}/${id}.json`, JSON.stringify({ route }), { httpMetadata: { contentType: "application/json" }, customMetadata: meta });
    return json({ id, at, kind });
  }
  return json({ error: "bad request" }, 400);
}

export async function onRequestPut(ctx) {
  const { request, env, params } = ctx;
  if (!env.BUCKET) return json({ error: "storage not configured" }, 500);
  const user = await userOf(ctx);
  if (!user) return json({ error: "login required" }, 401);
  if (user.demo_until) return json({ error: "demo" }, 403);
  const path = [].concat(params.path || []), ev = await getEvent(env, path[0]);
  if (!ev) return json({ error: "not found" }, 404);
  if (!isOrganiser(env, user, ev)) return json({ error: "forbidden" }, 403);
  if (path[1] === "file" && path.length === 3 && INPUTS[path[2]]) {
    // a race from the LiDAR alone takes back its generated map, edited (map.ocd only)
    if (ev.source !== "ocad" && !(ev.source === "lidar" && path[2] === "map.ocd")) return json({ error: "bad request" }, 400);
    const size = Number(request.headers.get("Content-Length") || 0);
    if (!size || size > INPUTS[path[2]]) return json({ error: "size", max: INPUTS[path[2]] }, 413);
    await env.BUCKET.put(`${EV}${ev.id}/${path[2]}`, request.body, { httpMetadata: { contentType: "application/octet-stream" } });
    if (path[2] !== "map.ocd") ev.coursesFrom = "file";
    ev.status = ev.status === "ready" ? "stale" : ev.status === "failed" ? "draft" : ev.status;
    await putEvent(env, ev);
    return json({ ok: true, size });
  }
  if (path.length !== 1) return json({ error: "bad request" }, 400);
  const b = await readBody(request);
  if (b?.name !== undefined) { const n = cleanName(b.name); if (!n) return json({ error: "name" }, 400); ev.name = n; }
  if (b?.type !== undefined) ev.type = b.type === "competition" ? "competition" : "training";
  if (b?.from !== undefined) ev.from = cleanDate(b.from);
  if (b?.to !== undefined) ev.to = cleanDate(b.to);
  if (b?.env !== undefined) ev.env = cleanEnv(b.env);
  if (b?.mapOpt !== undefined) ev.mapOpt = cleanMapOpt(b.mapOpt, ev);
  if (b?.courses !== undefined && ev.source === "ocad") ev.coursesFrom = b.courses === "file" ? "file" : "proposed";
  if (b?.published !== undefined) {
    if (b.published && !["ready", "stale"].includes(ev.status)) return json({ error: "not built" }, 400);
    ev.published = !!b.published;
  }
  await putEvent(env, ev);
  return json(view(ev, { mine: true }));
}

export async function onRequestDelete(ctx) {
  const { env, params } = ctx;
  if (!env.BUCKET) return json({ error: "storage not configured" }, 500);
  const user = await userOf(ctx);
  if (!user) return json({ error: "login required" }, 401);
  const path = [].concat(params.path || []), ev = await getEvent(env, path[0]);
  if (!ev) return json({ error: "not found" }, 404);
  if (!isOrganiser(env, user, ev) || path.length !== 1) return json({ error: "forbidden" }, 403);
  const keys = [];
  for (const p of [`${EV}${ev.id}/`, `${PKG}${ev.id}/`, `${RUNS}${ev.id}/`]) keys.push(...(await listAll(env, p)).map((o) => o.key));
  keys.push(`${EV}${ev.id}.json`, `${REQ}${ev.id}.json`);
  for (let i = 0; i < keys.length; i += 1000) await env.BUCKET.delete(keys.slice(i, i + 1000));
  return json({ ok: true });
}
