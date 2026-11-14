// /api/virtual/… — « Virtually » (Ozimut Pixel, pages/virtually.js). Every account since 2026-11-12 (owner: Pixel for all, its
// Entraînement and Avatar pages): the maps, their packages, the runs' list (the training's palmarès), one's own training runs;
// a run's route (the analysis: every account's since 2026-11-14) — any training run's, a competition's once its event is over;
// running competitions on the built-in maps stays the administrators' (administrators only 2026-11-10 to 12).
//   GET  races                         the maps: [{ id, race }] (each race.json, read here so that the page asks once)
//   GET  <race>/<file>                 a map's package (made offline by tools/virtually: race.json — its courses —, h.png,
//                                      cls.png, veg.png, ground.jpg, feats.json, trees.bin when LiDAR, map.ocd, thumb.webp; a town's town.json, town.bin, surf.png and facades.webp, tools/virtually/town_3d.py; town.bin.gz and map.ocd.gz the same
//                                      gzipped, tools/virtually/pkggz.py, which games/vworld.js inflates)
//   GET  runs?race=<id>                every finished run of that map: [{ id, race, u, name, course, t, sp, d, at, help, seed, mo, mine }]
//   GET  runs?race=day                 every « Carte du jour »'s runs, all days (the analysis of an invented forest's run)
//   GET  runs/<race>/<run>             one run with its route (the analysis, the ghosts): one's own, any to an administrator, any
//                                      training run to every account (owner, 2026-11-12: the ghosts; 2026-11-14: « every training
//                                      open to solo and multi analysis »), a competition's once its event's last day is past
//   POST runs { race, course, kind, event, t, sp, d, help, seed, mo, route }   a run just finished, kept under the account's name;
//                                      kind "training" (played as often as one likes; a map's own courses) or "competition"
//                                      (owner, 2026-11-11: played once — a second run of one event and course is refused, 409;
//                                      only competitions make the virtual index and the ranking), event its event's id
//   DELETE runs/<race>/<run>           one's own run (an administrator: any)
// The « Carte du jour » (pages/virtuallygen.js; owner, 2026-11-12): an invented terrain made in the browser from the day's seed has
// no package here; its runs are kept under the race « day-YYYYMMDD » (today or yesterday in Paris, training only), their event the
// signature of the courses the browser made (games/vgenpack.js courseSig).
// The maps are made from open data, or are a club's with its permission (owner, 2026-11-12); served to the administrators
// only for now. The runs live in R2 (cn-state)
// virtual-runs/<race>/<course>/<u>-<time>.json — the route in the object, its summary in custom metadata (one R2 list gives
// a map's results) —; `u` is a hash of the account's number (never answered as such), so that the results tell runners
// apart; account deletion removes them (api/account/delete.js).
import { allow, isAdmin, json, nowIso, readBody, withUser } from "../../_lib/api.js";
import { runnerHash } from "../../_lib/virtual.js";

const FILE = /^([a-z0-9-]{1,40})\/(race\.json|h\.png|cls\.png|veg\.png|ground\.jpg|feats\.json|trees\.bin|map\.ocd|map\.ocd\.gz|map\.webp|thumb\.webp|town\.json|town\.bin|town\.bin\.gz|surf\.png|facades\.webp)$/;
const TYPES = { json: "application/json", png: "image/png", jpg: "image/jpeg", webp: "image/webp", bin: "application/octet-stream", ocd: "application/octet-stream", gz: "application/gzip" };
const ID = /^[a-z0-9-]{1,40}$/, COURSE = /^[a-z0-9_]{1,24}$/, RUN = /^[0-9a-f]{12}-[0-9a-z]{6,12}$/;
const RUNS = "virtual-runs/";
const DAY = /^day-(\d{8})$/, SIG = /^[0-9a-f]{1,8}$/;
/** Paris's day as YYYYMMDD, `back` days ago. */
const parisDay = (back = 0) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(Date.now() - back * 86400000)).map((x) => [x.type, x.value]));
  return `${p.year}${p.month}${p.day}`;
};

/** Is this race an event whose last day is past (api/virtual/events: its `to`, UTC days as the events' own dates)? A competition on
 *  a built-in map, or an event without an end date, is never over. */
async function eventOver(env, race) {
  if (!/^e[a-z0-9]{9}$/.test(race)) return false;
  const o = await env.BUCKET.get(`virtual-events/${race}.json`);
  const ev = o ? await o.json().catch(() => null) : null;
  return !!ev?.to && ev.to < new Date().toISOString().slice(0, 10);
}

async function listAll(env, prefix, opts = {}) {
  const out = []; let cursor;
  do {
    const r = await env.BUCKET.list({ prefix, cursor, limit: 1000, ...opts });
    out.push(...r.objects);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}

/** A run's map options as games/vmapopt.js writes them (« nopaths+mem »), anything else left out; "" the whole map. */
const LAYERS = ["nopaths", "noveg", "relief", "contours"];
const cleanMo = (s) => { const p = String(s || "").split("+"); return [p.find((x) => LAYERS.includes(x)), p.includes("mem") ? "mem" : ""].filter(Boolean).join("+"); };
const summary = (o, me) => {
  const m = o.customMetadata || {}, parts = o.key.slice(RUNS.length).split("/");
  return { id: parts[2].replace(/\.json$/, ""), race: parts[0], course: parts[1], u: m.u, name: m.n || "", t: Number(m.t), d: Number(m.d) || 0,
    sp: String(m.sp || "").split(",").filter(Boolean).map(Number), at: m.at || "", help: m.h === "1", seed: Number(m.s) || null,
    kind: m.k === "competition" ? "competition" : "training", event: m.e || "", mo: m.mo || "", mine: m.u === me };
};

export const onRequestGet = withUser(async ({ request, env, params }, user) => {
  if (!env.BUCKET) return json({ error: "storage not configured" }, 500);
  const path = [].concat(params.path || []);
  const p = path.join("/");
  if (p === "races") {
    const l = await env.BUCKET.list({ prefix: "virtual/", delimiter: "/" });
    const ids = (l.delimitedPrefixes || []).map((x) => x.slice(8, -1)).filter((x) => ID.test(x));
    const races = (await Promise.all(ids.map(async (id) => {
      const o = await env.BUCKET.get(`virtual/${id}/race.json`);
      if (!o) return null;
      try {
        const r = await o.json(), th = await env.BUCKET.head(`virtual/${id}/thumb.webp`);
        // the frame and the courses: what the page lists and draws (not the classes and speeds)
        return { id, thumb: !!th, race: { id, scale: r.scale, std: r.std, W: r.W, H: r.H, k: r.k, mm0: r.mm0, source: r.source, map: r.map, photoAuthors: r.photoAuthors,
          lonlat: r.lonlat, courses: r.courses || (r.course ? [{ id: "course", ...r.course }] : []) } };
      } catch (e) { return null; }
    }))).filter(Boolean);
    return json({ races }, 200, { "Cache-Control": "private, no-store" });
  }
  if (path[0] === "runs") {
    const me = await runnerHash(env, user.id);
    if (path.length === 1) {
      const race = new URL(request.url).searchParams.get("race") || "";
      if (!ID.test(race)) return json({ error: "bad request" }, 400);
      // « day »: every Carte du jour's runs (their races day-YYYYMMDD), for the analysis
      const objs = await listAll(env, race === "day" ? `${RUNS}day-` : `${RUNS}${race}/`, { include: ["customMetadata"] });
      return json({ runs: objs.map((o) => summary(o, me)).filter((r) => r.u && Number.isFinite(r.t)) }, 200, { "Cache-Control": "private, no-store" });
    }
    const [, race, run] = path;
    if (!ID.test(race || "") || !RUN.test(run || "")) return json({ error: "bad request" }, 400);
    const found = await env.BUCKET.list({ prefix: `${RUNS}${race}/`, include: ["customMetadata"] });
    const o = found.objects.find((x) => x.key.endsWith(`/${run}.json`));
    if (!o) return json({ error: "not found" }, 404);
    // another's run: a training's route is everyone's (the ghosts, the analysis); a competition's once its event is over
    if (!run.startsWith(`${me}-`) && !isAdmin(env, user) && o.customMetadata?.k === "competition" && !(await eventOver(env, race)))
      return json({ error: "forbidden" }, 403);
    const body = await env.BUCKET.get(o.key);
    if (!body) return json({ error: "not found" }, 404);
    return json({ ...summary(o, me), route: (await body.json()).route || [] }, 200, { "Cache-Control": "private, max-age=3600" });
  }
  const m = FILE.exec(p);
  if (!m) return json({ error: "bad request" }, 400);
  const etag = request.headers.get("If-None-Match");
  const o = await env.BUCKET.get(`virtual/${p}`, etag ? { onlyIf: { etagDoesNotMatch: etag.replace(/"/g, "") } } : undefined);
  if (!o) return json({ error: "not found" }, 404);
  const headers = { "Content-Type": TYPES[p.split(".").pop()], "Cache-Control": "private, max-age=3600", ETag: `"${o.etag}"` };
  if (!("body" in o) || !o.body) return new Response(null, { status: 304, headers });
  return new Response(o.body, { headers });
});

export const onRequestPost = withUser(async ({ request, env, params }, user) => {
  if (!env.BUCKET) return json({ error: "storage not configured" }, 500);
  if ([].concat(params.path || []).join("/") !== "runs") return json({ error: "bad request" }, 400);
  if (user.demo_until) return json({ error: "demo" }, 403);
  if (!(await allow(env, `virtual:${user.id}`, 60, 3600))) return json({ error: "rate" }, 429);
  const b = await readBody(request);
  const race = String(b?.race || ""), course = String(b?.course || ""), t = Number(b?.t);
  const sp = Array.isArray(b?.sp) ? b.sp.map(Number) : [];
  if (!ID.test(race) || !COURSE.test(course) || !(t > 0 && t < 86400) || sp.length > 60 || !sp.every((x) => x >= 0 && x <= t + 1)) return json({ error: "bad request" }, 400);
  const day = DAY.exec(race);
  if (day) {                                               // the « Carte du jour »: today's or yesterday's, a training with its courses' signature
    if (day[1] !== parisDay() && day[1] !== parisDay(1)) return json({ error: "not found" }, 404);
    if (b?.kind === "competition" || !SIG.test(String(b?.event || ""))) return json({ error: "bad request" }, 400);
  } else if (!(await env.BUCKET.head(`virtual/${race}/race.json`))) return json({ error: "not found" }, 404);
  // the route: [t s, x m, z m] every second or so, rounded to a decimetre; 6 hours at most
  const route = (Array.isArray(b?.route) ? b.route : []).slice(0, 22000)
    .filter((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)).map(([a, x, z]) => [Math.round(a * 10) / 10, Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
  const kind = b?.kind === "competition" ? "competition" : "training", event = String(b?.event || "");
  if (event && !ID.test(event)) return json({ error: "bad request" }, 400);
  if (kind === "competition" && !isAdmin(env, user)) return json({ error: "forbidden" }, 403);   // competitions: the administrators' for now
  const u = await runnerHash(env, user.id);
  if (kind === "competition") {
    const mine = await listAll(env, `${RUNS}${race}/${course}/${u}-`, { include: ["customMetadata"] });
    if (mine.some((o) => o.customMetadata?.k === "competition" && (o.customMetadata?.e || "") === event)) return json({ error: "already run" }, 409);
  }
  const id = `${u}-${Date.now().toString(36)}`, at = nowIso();
  const seed = Number(b?.seed), d = Number(b?.d);
  const meta = { u, n: String(user.display_name || "").slice(0, 80), t: String(Math.round(t * 10) / 10), sp: sp.map((x) => Math.round(x * 10) / 10).join(","),
    at, h: b?.help ? "1" : "0", d: Number.isFinite(d) ? String(Math.round(d)) : "0", s: seed > 0 && seed < 20000 ? String(Math.round(seed)) : "", k: kind, e: event };
  if (cleanMo(b?.mo)) meta.mo = cleanMo(b.mo);           // the map options the runner chose (games/vmapopt.js)
  await env.BUCKET.put(`${RUNS}${race}/${course}/${id}.json`, JSON.stringify({ route }),
    { httpMetadata: { contentType: "application/json" }, customMetadata: meta });
  return json({ id, at });
});

export const onRequestDelete = withUser(async ({ env, params }, user) => {
  if (!env.BUCKET) return json({ error: "storage not configured" }, 500);
  const [head, race, run] = [].concat(params.path || []);
  if (head !== "runs" || !ID.test(race || "") || !RUN.test(run || "")) return json({ error: "bad request" }, 400);
  const me = await runnerHash(env, user.id);
  if (!run.startsWith(`${me}-`) && !isAdmin(env, user)) return json({ error: "forbidden" }, 403);
  const found = await env.BUCKET.list({ prefix: `${RUNS}${race}/` });
  const o = found.objects.find((x) => x.key.endsWith(`/${run}.json`));
  if (!o) return json({ error: "not found" }, 404);
  await env.BUCKET.delete(o.key);
  return json({ ok: true });
});
