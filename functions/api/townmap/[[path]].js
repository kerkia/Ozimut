// /api/townmap — Cartographier's « Plan de ville (sprint) » (owner, 2026-11-12: one engine for a town's sprint map, the generator
// Pixel's town races use; quality before speed): a town's ISSprOM map made from IGN's LiDAR HD, BD TOPO, BD ORTHO and its
// infrared, the cadastre and OpenStreetMap by the GitHub workflow townmap.yml (tools/virtually/townmap_ci.py), kept in R2 (cn-state):
//   townmap/req/<id>.json     a request: { id, lat, lon, w, h, by, at, status: queued | done | failed, progress: { stage: fetch |
//                             map | upload, frac, note, at } while it is made, result: { objects, bytes, lidar }, error }
//   townmap/out/<id>.json.gz  the map's objects (town_map.py's map_objects.json: { scale, realWorld: { x, y } in Lambert 93, objects:
//                             [{ sym, otp, ang, rings (map mm about realWorld at that scale), curve }], area, lidar, cadastre }), gzipped
//   POST { lat, lon, w, h, fix }  a map asked for: the area's centre and size in metres (France only: IGN's data) → { req, started };
//                             fix: with the legibility corrections (legibility.py's repair passes, an hour or more a km²: 1 km² at
//                             most; townmap.yml's job « fix », apart from the quick maps; owner, 2026-11-18)
//   GET ?req=<id>             a request's state (the page asks while it waits) — its owner's, or an administrator's
//   GET /out/<id>             the objects, once done
// Only the area's centre and size are sent by the page. Every signed-in account (Carto is every account's), 3 maps a day, the
// administrators 20: each one downloads hundreds of MB of point clouds on the workflow's runner.
import { allow, isAdmin, json, nowIso, readBody, withUser } from "../../_lib/api.js";

const Q = "townmap/req/", OUT = "townmap/out/";
const MIN = 100, MAX = 2000;                                  // a side, metres (the runner's disk and memory: 2 × 2 km at most)
const FIX_MAX = 1e6;                                          // m², with the corrections (the job's 5½ hours)
// metropolitan France and Corsica, roughly (IGN's LiDAR HD and BD TOPO): the page asks only there, and the workflow checks the
// border itself (townmap_ci.py: « outside metropolitan France »)
const inFrance = (lat, lon) => lat >= 41.3 && lat <= 51.2 && lon >= -5.3 && lon <= 9.7;

async function startRun(env) {
  if (!env.GH_DISPATCH_TOKEN) return false;
  const r = await fetch(`https://api.github.com/repos/${env.GH_REPO || "kerkia/Ozimut"}/actions/workflows/townmap.yml/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ozimut-townmap", "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main" }),
  });
  return r.status === 204;
}

/** The requests of the same kind (with or without the corrections: two queues) still queued before one (ids begin with their time
 *  in base 36: they sort by time; the last six hours read). */
async function aheadOf(env, id, fix) {
  const t = parseInt(id.slice(0, 8), 36), since = (t - 6 * 3600e3).toString(36);
  let n = 0, cursor;
  do {
    const page = await env.BUCKET.list({ prefix: Q, startAfter: `${Q}${since}`, cursor, limit: 100 });
    for (const o of page.objects) {
      const k = o.key.slice(Q.length, -5);
      if (k >= id) continue;
      const v = await env.BUCKET.get(o.key).then((x) => x?.json()).catch(() => null);
      if (v?.status === "queued" && !!v.fix === fix) n++;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return n;
}

export const onRequestPost = withUser(async ({ request, env }, user) => {
  if (!env.BUCKET) return json({ error: "server not configured" }, 500);
  const b = await readBody(request);
  const lat = Number(b?.lat), lon = Number(b?.lon), w = Math.round(Number(b?.w)), h = Math.round(Number(b?.h));
  if (![lat, lon, w, h].every(Number.isFinite) || w < MIN || h < MIN) return json({ error: "bad area" }, 400);
  if (w > MAX || h > MAX) return json({ error: "too large", max: MAX }, 400);
  if (!inFrance(lat, lon)) return json({ error: "not france" }, 400);
  const fix = b?.fix === true;
  if (fix && w * h > FIX_MAX) return json({ error: "fix too large", max: FIX_MAX }, 400);
  if (!(await allow(env, `townmap:${user.id}`, isAdmin(env, user) ? 20 : 3, 86400))) return json({ error: "too many requests" }, 429);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await env.BUCKET.put(`${Q}${id}.json`, JSON.stringify({ id, lat: +lat.toFixed(6), lon: +lon.toFixed(6), w, h, ...(fix ? { fix } : {}), by: user.id, at: nowIso(), status: "queued" }),
    { httpMetadata: { contentType: "application/json" } });
  return json({ req: id, started: await startRun(env) });
});

export const onRequestGet = withUser(async ({ request, env, params }, user) => {
  if (!env.BUCKET) return json({ error: "server not configured" }, 500);
  const path = [].concat(params.path || []);
  const id = path[0] === "out" ? path[1] : new URL(request.url).searchParams.get("req");
  if (!/^[a-z0-9]{6,20}$/.test(id || "")) return json({ error: "bad request" }, 400);
  const o = await env.BUCKET.get(`${Q}${id}.json`);
  if (!o) return json({ error: "not found" }, 404);
  const r = await o.json();
  if (r.by !== user.id && !isAdmin(env, user)) return json({ error: "not found" }, 404);
  if (path[0] === "out") {
    const f = await env.BUCKET.get(`${OUT}${id}.json.gz`);
    if (!f) return json({ error: "not found" }, 404);
    // already gzipped: passed on as it is, the browser unpacks it
    return new Response(f.body, { encodeBody: "manual", headers: { "Content-Type": "application/json", "Content-Encoding": "gzip", "Cache-Control": "private, max-age=86400" } });
  }
  const waiting = r.status === "queued" && !r.progress;
  return json({ req: r.id, status: r.status, at: r.at, done: r.done || null, result: r.result || null, error: r.error || null,
    progress: r.status === "queued" ? r.progress || null : null, fix: !!r.fix, ahead: waiting ? await aheadOf(env, r.id, !!r.fix) : 0 });
});
