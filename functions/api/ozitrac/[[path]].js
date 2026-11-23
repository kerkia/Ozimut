// Ozitrac's relay API (docs/track/ozitrac.md; 2026-11-23): the tracking app needs no account. Every route but /config and
// /channel names a channel and goes to its Durable Object (live/src/ozitrac.js TracChannel, binding OZITRAC), which checks the
// secrets itself; this Function makes new channels, limits the anonymous routes by address, and sends the notifications the
// object asks for (data only, _lib/nativepush.js sendData). Public in _middleware.js: no session, ever.
//
//   GET    config                 the map's tiles and the batch intervals
//   POST   channel                a new channel -> { c, cs }
//   POST   alert                  the relay's own alerts (X-Relay = TRACK_RELAY_SECRET) -> notifications
//   GET    <c>                    the watchee's view (Bearer cs)
//   DELETE <c>                    everything goes (Bearer cs)
//   POST   <c>/invite             a code (Bearer cs)
//   POST   <c>/join               a watcher joins with a code
//   POST   <c>/push               a batch (Bearer cs)
//   GET    <c>/w/<w>              a watcher's read (Bearer ws)
//   PUT    <c>/w/<w>/push         a watcher's push token (Bearer ws)
//   DELETE <c>/w/<w>              a watcher goes (Bearer cs or ws)

import { allow, clientIp, json } from "../../_lib/api.js";
import { sendData } from "../../_lib/nativepush.js";

const A32 = "abcdefghijklmnopqrstuvwxyz234567";
const MAX_BODY = 512 * 1024;
const FORWARD = [
  ["GET", /^$/], ["DELETE", /^$/], ["POST", /^invite$/], ["POST", /^join$/], ["POST", /^push$/],
  ["GET", /^w\/[a-z2-7]{8}$/], ["PUT", /^w\/[a-z2-7]{8}\/push$/], ["DELETE", /^w\/[a-z2-7]{8}$/],
];

function rand32(n) {
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => A32[x & 31]).join("");
}
function randKey() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function sha(s) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}
const stub = (env, c) => env.OZITRAC.get(env.OZITRAC.idFromName(c));

/** The notifications a channel's object asked for; tokens gone are told back to it. */
async function notify(env, c, list) {
  const gone = [];
  for (const n of list || []) {
    const r = await sendData(env, n.push, n.data, { urgent: !!n.urgent, ttl: n.urgent ? 3600 : 1800 });
    if (r === "gone") gone.push(n.w);
  }
  if (gone.length) await stub(env, c).fetch("https://ozitrac/_gone", { method: "POST", body: JSON.stringify({ w: gone }) });
}

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const method = request.method;
  const head = parts[0] || "";

  if (head === "config" && method === "GET") {
    return json({
      tiles: env.OZITRAC_TILES || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: env.OZITRAC_TILES_CREDIT || "© OpenStreetMap",
      maxZoom: Number(env.OZITRAC_MAX_ZOOM) || 19,
      watched: 15, idle: 120,
    }, 200, { "Cache-Control": "public, max-age=3600" });
  }
  if (!env.OZITRAC) return json({ error: "off" }, 503);

  if (head === "channel" && method === "POST") {
    if (!(await allow(env, `ozc:${clientIp(request)}`, 20, 3600))) return json({ error: "too many" }, 429);
    for (let i = 0; i < 4; i++) {
      const c = rand32(16), cs = randKey();
      const r = await stub(env, c).fetch("https://ozitrac/init", { method: "POST", body: JSON.stringify({ c, csh: await sha(cs) }) });
      if (r.status === 201) return json({ c, cs }, 201);
    }
    return json({ error: "failed" }, 500);
  }

  if (head === "alert" && method === "POST") {
    const secret = request.headers.get("X-Relay") || "";
    if (!env.TRACK_RELAY_SECRET || secret !== env.TRACK_RELAY_SECRET) return json({ error: "forbidden" }, 403);
    const b = await request.json().catch(() => null);
    const list = Array.isArray(b?.notify) ? b.notify : [];
    const c = list[0]?.data?.c;
    if (c && /^[a-z2-7]{16}$/.test(c)) await notify(env, c, list);
    return json({ ok: true });
  }

  if (!/^[a-z2-7]{16}$/.test(head)) return json({ error: "bad request" }, 400);
  const rest = parts.slice(1).join("/");
  if (!FORWARD.some(([m, re]) => m === method && re.test(rest))) return json({ error: "bad request" }, 400);
  if (rest === "join" && !(await allow(env, `ozj:${clientIp(request)}`, 40, 3600))) return json({ error: "too many" }, 429);

  let body;
  if (method === "POST" || method === "PUT") {
    body = await request.text();
    if (body.length > MAX_BODY) return json({ error: "too large" }, 413);
  }
  const url = new URL(request.url);
  const res = await stub(env, head).fetch(`https://ozitrac/${rest}${url.search}`, {
    method, body, headers: { Authorization: request.headers.get("Authorization") || "", "Content-Type": "application/json" },
  });
  const out = await res.json().catch(() => ({ error: "failed" }));
  if (out && Array.isArray(out.notify)) {
    const list = out.notify;
    delete out.notify;
    if (list.length) ctx.waitUntil(notify(env, head, list));
  }
  return json(out, res.status, { "Cache-Control": "no-store" });
}
