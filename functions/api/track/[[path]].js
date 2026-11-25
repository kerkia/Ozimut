// /api/track/* — live GPS tracking and « Mes traces » (docs/track/design.md, the contract). Routes:
//
// Devices (no session; their own key as « Authorization: Bearer », a code, or the relay's secret — _middleware.js PUBLIC):
//   POST pair { code, device }            a phone signs in to the account a pair code names -> { device, key, account, … }
//   POST webtoken                          (key) -> { token }: a one-time ticket for the app's web view
//   POST session { token }                 the web view's session cookie from that ticket
//   POST push { v, run, seq, state, … }    a batch of fixes -> { ack, next, stop }
//   GET|POST osmand/<key>                  Traccar Client (OsmAnd protocol), one fix a request
//   POST claim { claim, key, kind, … }     a watch waiting to be claimed -> 202 { paired: false } | 200 { paired: true, … }
//   POST pushtoken { kind, token, env }    (key) the device's native push token
//   POST alert { user, run, kind, … }      the live relay's alerts (header X-Relay), to the watchers' devices
//   POST polar/webhook                     Polar AccessLink's webhook (its signature)
// Accounts (a session; with TRACK_OPEN "0" the administrators and the accounts tied to them by the tracking):
//   GET  me                                who I am here: my children, the accounts I follow, my devices, my settings
//   POST children { first, last, birthYear, licence }    a child account   ·  PUT children/<id>  ·  DELETE children/<id>
//   POST guardian-code { account }         a code inviting another parent  ·  POST guardian/accept { code }
//   POST attach-code                       an under-15's own account asks a parent ·  POST attach/accept { code }
//   POST pair-code { account }             a code a phone pairs with (QR « https://ozimut.com/t/<code> »)
//   GET  devices?account=  ·  PUT devices/<id> { label }  ·  DELETE devices/<id>
//   POST devices/claim { account, code }   a watch's 6-character code   ·   POST devices/osmand { account }  Traccar Client
//   POST invite-code { account }           a watcher's invitation  ·  POST invite/accept { code }
//   GET  watchers?account=  ·  DELETE watchers { account, watcher }
//   GET|PUT settings?account=              batch, cap, call, onlyTracker, area
//   GET  live                              the accounts I may follow and their run under way
//   GET  runs?account=  ·  GET runs/<id>?account=  ·  GET runs/<id>/gpx?account=  ·  DELETE runs/<id>?account=
//   POST runs/<id>/stop?account=  ·  POST runs/<id>/keep?account=  ·  POST runs/import { account, name, source, gpx|trace }
//   POST takeover { email, password }  ·  POST takeover/confirm { token }   a child account becomes its own from 15
//   GET  polar/connect  ·  GET polar/callback  ·  DELETE polar
// R2 `cn-state`: track/<user>/<run>/<seq>.json (the batches), track/<user>/<run>.json (a whole run), track/takeover/<user>.json.

import { allow, clientIp, cleanEmail, currentUser, isAdmin, json, LANGS, nowIso, readBody, sessionCookie, siteUrl, userLang,
  validEmail } from "../../_lib/api.js";
import { hashPassword, newToken, sha256hex, randomBytes } from "../../_lib/crypto.js";
import { accountView, memberships, sessionCountries } from "../../_lib/countries.js";
import { pushToUser } from "../../_lib/push.js";
import { sendOrQueue } from "../../_lib/mail.js";
import { takeoverMail, trackPush } from "../../_lib/templates.js";
import * as T from "../../_lib/track.js";
import { TRACCAR_SETTINGS, traccarLink, traccarPage } from "../../_lib/traccarpage.js";
import { onRequestPost as pageView } from "../track.js";

const NEED = { error: "not ready" };              // before migration 0029

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  if (!env.DB) return json({ error: "server not configured" }, 500);
  const parts = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const route = parts.join("/"), method = request.method;
  // /api/track itself is the page-view counter (functions/api/track.js): this catch-all also matches it, so it hands it over
  // (2026-11-23: since 2026-11-21 the page views, and the hooks they run — the CI runs the site starts, Santé's translations,
  // the robots' copy, the entry forms' closing — went unanswered here)
  if (!parts.length) return method === "POST" ? pageView(ctx) : json({ error: "not found" }, 404);
  try {
    // ---- devices ----
    if (route === "pair" && method === "POST") return await pair(ctx);
    if (route === "webtoken" && method === "POST") return await webToken(ctx);
    if (route === "session" && method === "POST") return await webSession(ctx);
    if (route === "push" && method === "POST") return await push(ctx);
    if (parts[0] === "osmand" && parts.length === 2) return await osmand(ctx, parts[1]);
    if (route === "claim" && method === "POST") return await claim(ctx);
    if (route === "pushtoken" && method === "POST") return await pushToken(ctx);
    if (route === "alert" && method === "POST") return await alert(ctx);
    if (route === "polar/webhook" && method === "POST") return await polarWebhook(ctx);
    // ---- accounts ----
    const me = await currentUser(request, env);
    if (!me) return json({ error: "login required" }, 401);
    if (route === "takeover/confirm" && method === "POST") return await takeoverConfirm(ctx, me);
    if (!(await T.trackAllowed(env, me))) return json({ error: "forbidden" }, 403);
    if (route === "me" && method === "GET") return await meView(ctx, me);
    if (route === "children" && method === "POST") return await childCreate(ctx, me);
    if (parts[0] === "children" && parts.length === 2) return await childEdit(ctx, me, Number(parts[1]));
    if (route === "guardian-code" && method === "POST") return await codeFor(ctx, me, "guardian", 7 * 1440);
    if (route === "guardian/accept" && method === "POST") return await guardianAccept(ctx, me);
    if (route === "attach-code" && method === "POST") return await attachCode(ctx, me);
    if (route === "attach/accept" && method === "POST") return await attachAccept(ctx, me);
    if (route === "pair-code" && method === "POST") return await pairCode(ctx, me);
    if (route === "invite-code" && method === "POST") return await codeFor(ctx, me, "watch", 7 * 1440);
    if (route === "invite/accept" && method === "POST") return await inviteAccept(ctx, me);
    if (route === "devices" && method === "GET") return await devices(ctx, me);
    if (route === "devices/claim" && method === "POST") return await deviceClaim(ctx, me);
    if (route === "devices/osmand" && method === "POST") return await deviceOsmand(ctx, me);
    if (parts[0] === "devices" && parts.length === 2) return await deviceEdit(ctx, me, parts[1]);
    if (route === "watchers") return await watchers(ctx, me);
    if (route === "settings") return await settings(ctx, me);
    if (route === "live" && method === "GET") return await live(ctx, me);
    if (route === "runs" && method === "GET") return await runs(ctx, me);
    if (route === "runs/import" && method === "POST") return await runImport(ctx, me);
    if (parts[0] === "runs" && parts.length >= 2) return await runOne(ctx, me, parts[1], parts[2] || "", method);
    if (route === "takeover" && method === "POST") return await takeover(ctx, me);
    if (route === "polar/connect" && method === "GET") return await polarConnect(ctx, me);
    if (route === "polar/callback" && method === "GET") return await polarCallback(ctx, me);
    if (route === "polar" && method === "DELETE") return await polarUnlink(ctx, me);
    return json({ error: "not found" }, 404);
  } catch (e) {
    if (T.missing(e)) return json(NEED, 503);
    return json({ error: "server", detail: String(e?.message || e).slice(0, 200) }, 500);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// helpers

const accountParam = (request, b = null) => Number(b?.account ?? new URL(request.url).searchParams.get("account")) || 0;
const nameOf = (u) => u.first_name || u.display_name || "";
const userById = (env, id) => env.DB.prepare("SELECT * FROM users WHERE id = ? AND status = 'active'").bind(id).first();
/** The account a request is about: `account` (one I manage or watch, by `need`), else myself. -> user or a Response */
async function target(ctx, me, b, need = "manage") {
  const id = accountParam(ctx.request, b) || me.id;
  const ok = need === "watch" ? await T.canWatch(ctx.env, me, id) : await T.canManage(ctx.env, me, id);
  if (!ok) return json({ error: "forbidden" }, 403);
  return id === me.id ? me : await userById(ctx.env, id) || json({ error: "account" }, 404);
}
const accountOut = (u) => ({ id: u.id, name: nameOf(u), last: u.last_name || "", child: u.child === 1, lang: userLang(u),
  birthYear: u.birth_year || null, licence: u.licence || "" });

async function readJson(request) {
  try {
    const body = request.headers.get("Content-Encoding") === "gzip"
      ? new Response(request.body.pipeThrough(new DecompressionStream("gzip"))) : request;
    const b = await body.json();
    return b && typeof b === "object" ? b : null;
  } catch (e) { return null; }
}

// ---------------------------------------------------------------------------------------------------------------------
// devices

async function pair({ request, env }) {
  if (!(await allow(env, `tpair:${clientIp(request)}`, 20, 3600))) return json({ error: "too many" }, 429);
  const b = await readBody(request);
  const code = T.cleanCode(b?.code);
  if (code.length !== 8) return json({ error: "code" }, 400);
  const row = await T.takeCode(env, "pair", code);
  const user = row && await userById(env, row.user_id);
  if (!user) return json({ error: "code" }, 400);
  const d = b.device || {};
  const kind = ["phone", "applewatch", "garmin", "wearos"].includes(d.kind) ? d.kind : "phone";
  const id = T.newId("d_"), key = T.newKey();
  await env.DB.prepare(`INSERT INTO track_devices (id, user_id, kind, label, key_hash, platform, model, app_version, created_at, last_seen)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, user.id, kind, T.clean(d.model, 60) || null, await T.hashOf(key),
    T.clean(`${d.platform || ""} ${d.os || ""}`, 40) || null, T.clean(d.model, 60) || null, T.clean(d.version, 20) || null, nowIso(), nowIso()).run();
  const webToken = await T.makeCode(env, "web", user.id, user.id, 5);
  return json({ device: id, key, account: accountOut(user), watchers: await T.watcherNames(env, user.id),
    settings: await T.settingsOf(env, user.id), webToken });
}

async function webToken({ request, env }) {
  const d = await T.deviceOf(env, request);
  if (!d || d.pending) return json({ error: "device" }, 401);
  return json({ token: await T.makeCode(env, "web", d.user_id, d.user_id, 5) });
}

/** The app's web view signed in to its device's account: a session cookie, as a login gives. */
async function webSession({ request, env }) {
  if (!(await allow(env, `tsess:${clientIp(request)}`, 30, 3600))) return json({ error: "too many" }, 429);
  const b = await readBody(request);
  const row = b?.token && await T.takeCode(env, "web", String(b.token).slice(0, 80));
  const user = row && await userById(env, row.user_id);
  if (!user) return json({ error: "token" }, 400);
  const view = await accountView(env, user);
  const s = await T.settingsOf(env, user.id);
  return json({ ok: true, user: view.body, home: user.child && s.onlyTracker ? "#/suivi/moi" : "#/" }, 200, { "Set-Cookie": view.cookie });
}

/** A batch of fixes (the contract's « Sending »). */
async function push(ctx) {
  const { request, env } = ctx;
  const d = await T.deviceOf(env, request);
  if (!d || d.pending) return json({ error: "device" }, 401);
  if (!(await allow(env, `tpush:${d.id}`, 400, 3600))) return json({ error: "slow", next: 60 }, 429);
  const b = await readJson(request);
  if (!b || b.v !== 1) return json({ error: "bad request" }, 400);
  const uid = d.user_id, now = nowIso();
  const bat = Number.isFinite(Number(b.bat)) ? Math.max(0, Math.min(100, Math.round(Number(b.bat)))) : null;
  await env.DB.prepare("UPDATE track_devices SET last_seen = ?, battery = COALESCE(?, battery) WHERE id = ?").bind(now, bat, d.id).run();
  const s = await T.settingsOf(env, uid);
  if (!b.run) return json({ ack: 0, next: T.IDLE_NEXT, stop: false });           // a heartbeat outside a run
  if (!T.RUN_ID.test(String(b.run))) return json({ error: "run" }, 400);
  const seq = Number(b.seq);
  if (!Number.isInteger(seq) || seq < 1) return json({ error: "seq" }, 400);
  const f = T.readBatch(b);
  if (typeof f === "string") return json({ error: f }, f === "size" ? 413 : 400);
  const state = ["run", "end", "help"].includes(b.state) ? b.state : "run";
  const share = b.share === "private" || d.user.guardian_wanted === 1 ? "private" : "watchers";
  let r = await env.DB.prepare("SELECT * FROM track_runs WHERE id = ?").bind(b.run).first();
  if (r && r.user_id !== uid) return json({ error: "closed" }, 409);
  if (!r) {
    if (seq !== 1) return json({ ack: 0, next: 0, stop: false });                  // the run's start lost: send from 1
    await env.DB.prepare(`INSERT INTO track_runs (id, user_id, device_id, source, started_at, state, share, created_at)
      VALUES (?, ?, ?, ?, ?, 'run', ?, ?) ON CONFLICT (id) DO NOTHING`).bind(b.run, uid, d.id, d.kind, T.runStart(b.run), share, now).run();
    r = await env.DB.prepare("SELECT * FROM track_runs WHERE id = ?").bind(b.run).first();
  }
  const summary = parseJson(r.summary) || {};
  const stopped = !!summary.stoppedBy;
  if (seq <= r.last_seq) return json({ ack: r.last_seq, next: 0, stop: stopped });   // already held
  if (seq > r.last_seq + 1) return json({ ack: r.last_seq, next: 0, stop: stopped }); // a gap: resend from last_seq + 1
  if (r.state === "end" && !stopped) return json({ error: "closed" }, 409);
  const startedMs = Date.parse(r.started_at);
  // Ozitrac's long pace (docs/track/ozitrac.md « Pace »): kept 7 days whatever the account's cap, its own batch interval
  const pace = longPace(b.pace);
  const cap = pace ? LONG_CAP : s.cap;
  const overCap = Date.now() - startedMs > (cap + 1800) * 1000;
  // the batch kept as received, normalised
  if (f.t.length) {
    await env.BUCKET.put(T.batchKey(uid, r.id, seq), JSON.stringify({ t: f.t, la: f.la, lo: f.lo, ac: f.ac, ...(f.al ? { al: f.al } : {}) }),
      { httpMetadata: { contentType: "application/json" } });
    summary.start ||= [f.la[0], f.lo[0], f.t[0]];
  }
  const dist = T.distanceOf(f, summary.last || null);
  if (f.t.length) summary.last = [f.la.at(-1), f.lo.at(-1), f.t.at(-1)];
  const ends = state === "end" || overCap || stopped;
  const newState = ends ? "end" : state === "help" ? "help" : r.state === "help" ? "help" : "run";
  await env.DB.prepare(`UPDATE track_runs SET last_seq = ?, fixes = fixes + ?, distance = distance + ?, last_at = ?, state = ?,
    share = ?, ended_at = ?, summary = ? WHERE id = ?`).bind(seq, f.t.length, dist, now, newState, share,
    ends ? now : null, JSON.stringify(summary), r.id).run();
  // the live object: the watchers' pages and the alerts
  let watched = 0;
  const lt = share === "watchers" ? T.liveTrack(env, uid) : null;
  if (lt) {
    try {
      const res = await lt.fetch("https://live/push", { method: "POST", body: JSON.stringify({
        uid, run: r.id, name: nameOf(d.user), seq, t: f.t, la: f.la, lo: f.lo, ac: f.ac, state: ends ? "end" : state,
        bat, lp: !!b.lp, startedAt: startedMs, batch: pace ? pace.send : s.batch, cap, long: !!pace, area: s.area, at: Date.now() }) });
      watched = (await res.json()).watchers || 0;
    } catch (e) { /* the relay unavailable: the run is kept all the same */ }
  }
  if (ends) ctx.waitUntil(T.sealRun(env, uid, r.id).catch(() => {}));
  const next = state === "help" ? s.batch
    : pace ? (pace.boost * 1000 > Date.now() ? 15 : pace.send)
    : watched ? s.batch : T.IDLE_NEXT;
  return json({ ack: seq, next, stop: stopped || overCap });
}

const LONG_CAP = 7 * 86400;
/** A batch's Ozitrac pace when it is the long one: { send, boost } (seconds, Unix second), else null. */
function longPace(p) {
  if (!p || typeof p !== "object" || p.mode !== "long") return null;
  const send = Math.round(Number(p.send));
  return { send: Number.isFinite(send) ? Math.max(15, Math.min(3600, send)) : 600, boost: Math.max(0, Number(p.boost) || 0) };
}

const parseJson = (s) => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };

/** Traccar Client (OsmAnd protocol): one fix a request; a run opens at the first fix and closes after 10 minutes' silence. */
async function osmand(ctx, key) {
  const { request, env } = ctx;
  const d = await T.deviceByKey(env, key);
  if (!d || d.pending || d.kind !== "osmand") return new Response("device", { status: 401 });
  if (!(await allow(env, `tosm:${d.id}`, 2000, 3600))) return new Response("slow", { status: 429 });
  const q = new URL(request.url).searchParams;
  if (request.method === "POST") {
    const ct = request.headers.get("Content-Type") || "";
    if (ct.includes("json")) {
      const j = await readBody(request);
      const loc = j?.location || j || {};
      const c = loc.coords || loc;
      for (const [k, v] of Object.entries({ lat: c.latitude ?? c.lat, lon: c.longitude ?? c.lon, accuracy: c.accuracy, altitude: c.altitude,
        timestamp: loc.timestamp, batt: loc.battery?.level != null ? Math.round(loc.battery.level * 100) : undefined })) if (v != null) q.set(k, v);
    } else for (const [k, v] of new URLSearchParams(await request.text())) q.set(k, v);
  }
  // a browser (the QR code read by the phone's camera, the address pasted in a tab): what to do instead
  if (request.method === "GET" && !q.has("lat") && /text\/html/.test(request.headers.get("Accept") || ""))
    return traccarPage(request, `${new URL(request.url).origin}/api/track/osmand/${key}`, q.get("id") || d.id);
  const lat = Number(q.get("lat")), lon = Number(q.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return new Response("OK");
  const ts = q.get("timestamp");
  let t = ts && /^\d+(\.\d+)?$/.test(ts) ? Number(ts) : Date.parse(ts || "") / 1000;
  if (!Number.isFinite(t)) t = Date.now() / 1000;
  if (t > 1e11) t /= 1000;
  t = Math.round(t);
  const uid = d.user_id, now = nowIso();
  let r = await env.DB.prepare(`SELECT * FROM track_runs WHERE device_id = ? AND state != 'end' ORDER BY started_at DESC LIMIT 1`).bind(d.id).first();
  if (r && Date.now() - Date.parse(r.last_at || r.started_at) > 600e3) {
    await env.DB.prepare("UPDATE track_runs SET state = 'end', ended_at = ? WHERE id = ?").bind(r.last_at || now, r.id).run();
    ctx.waitUntil(T.sealRun(env, uid, r.id).catch(() => {}));
    r = null;
  }
  if (!r) {
    const id = `r_${new Date(t * 1000).toISOString().replace(/[-:]/g, "").slice(0, 15)}_${T.newId("", 4)}`;
    await env.DB.prepare(`INSERT INTO track_runs (id, user_id, device_id, source, started_at, state, share, created_at)
      VALUES (?, ?, ?, 'osmand', ?, 'run', 'watchers', ?)`).bind(id, uid, d.id, new Date(t * 1000).toISOString(), now).run();
    r = await env.DB.prepare("SELECT * FROM track_runs WHERE id = ?").bind(id).first();
  }
  const f = { t: [t], la: [Math.round(lat * 1e6)], lo: [Math.round(lon * 1e6)], ac: [Math.round(Number(q.get("accuracy")) || 0)],
    al: q.get("altitude") ? [Math.round(Number(q.get("altitude")) || 0)] : null };
  const seq = r.last_seq + 1, summary = parseJson(r.summary) || {};
  await env.BUCKET.put(T.batchKey(uid, r.id, seq), JSON.stringify({ t: f.t, la: f.la, lo: f.lo, ac: f.ac, ...(f.al ? { al: f.al } : {}) }));
  summary.start ||= [f.la[0], f.lo[0], t];
  const dist = T.distanceOf(f, summary.last || null);
  summary.last = [f.la[0], f.lo[0], t];
  const bat = q.get("batt") != null ? Math.round(Number(q.get("batt"))) : null;
  await env.DB.batch([
    env.DB.prepare("UPDATE track_runs SET last_seq = ?, fixes = fixes + 1, distance = distance + ?, last_at = ?, summary = ? WHERE id = ?")
      .bind(seq, dist, now, JSON.stringify(summary), r.id),
    env.DB.prepare("UPDATE track_devices SET last_seen = ?, battery = COALESCE(?, battery) WHERE id = ?").bind(now, bat, d.id),
  ]);
  const lt = T.liveTrack(env, uid);
  if (lt) {
    const s = await T.settingsOf(env, uid);
    ctx.waitUntil(lt.fetch("https://live/push", { method: "POST", body: JSON.stringify({ uid, run: r.id, name: nameOf(d.user), seq,
      t: f.t, la: f.la, lo: f.lo, ac: f.ac, state: "run", bat, lp: false, startedAt: Date.parse(r.started_at), batch: s.batch,
      cap: s.cap, area: s.area, at: Date.now() }) }).catch(() => {}));
  }
  return new Response("OK");
}

/** A watch waiting for an account (it shows its claim code), then paired. */
async function claim({ request, env }) {
  if (!(await allow(env, `tclaim:${clientIp(request)}`, 600, 3600))) return json({ error: "too many" }, 429);
  const b = await readBody(request);
  const key = String(b?.key || ""), code = T.cleanCode(b?.claim);
  if (!/^[A-Za-z0-9_-]{32,80}$/.test(key) || code.length !== 6) return json({ error: "bad request" }, 400);
  const kind = ["garmin", "applewatch", "wearos"].includes(b.kind) ? b.kind : "garmin";
  const h = await T.hashOf(key);
  const d = await env.DB.prepare("SELECT * FROM track_devices WHERE key_hash = ?").bind(h).first();
  if (d?.revoked_at) return json({ error: "device" }, 401);
  if (d?.user_id) {
    const u = await userById(env, d.user_id);
    if (!u) return json({ error: "device" }, 401);
    await env.DB.prepare("UPDATE track_devices SET last_seen = ?, app_version = ? WHERE id = ?").bind(nowIso(), T.clean(b.version, 20) || null, d.id).run();
    return json({ paired: true, device: d.id, account: accountOut(u), watchers: await T.watcherNames(env, u.id), settings: await T.settingsOf(env, u.id) });
  }
  if (d) await env.DB.prepare("UPDATE track_devices SET last_seen = ?, claim = ? WHERE id = ?").bind(nowIso(), code, d.id).run();
  else {
    // one claim code at a time: an older waiting device with the same code gives way
    await env.DB.prepare("UPDATE track_devices SET claim = NULL WHERE claim = ? AND user_id IS NULL").bind(code).run();
    await env.DB.prepare(`INSERT INTO track_devices (id, user_id, kind, label, key_hash, model, app_version, claim, created_at, last_seen)
      VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(T.newId("d_"), kind, T.clean(b.model, 60) || null, h, T.clean(b.model, 60) || null,
      T.clean(b.version, 20) || null, code, nowIso(), nowIso()).run();
  }
  return json({ paired: false }, 202);
}

async function pushToken({ request, env }) {
  const d = await T.deviceOf(env, request);
  if (!d || d.pending) return json({ error: "device" }, 401);
  const b = await readBody(request);
  const kind = ["fcm", "apns"].includes(b?.kind) ? b.kind : null;
  const token = String(b?.token || "").slice(0, 400);
  if (!kind || !/^[A-Za-z0-9:_.-]{20,400}$/.test(token)) return json({ error: "bad request" }, 400);
  // a token moves with its device: another device row holding it lets it go
  await env.DB.batch([
    env.DB.prepare("UPDATE track_devices SET push_token = NULL WHERE push_token = ? AND id != ?").bind(token, d.id),
    env.DB.prepare("UPDATE track_devices SET push_kind = ?, push_token = ?, push_env = ? WHERE id = ?")
      .bind(kind, token, b.env === "dev" ? "dev" : "prod", d.id),
  ]);
  return json({ ok: true });
}

/** The live relay's alerts (header X-Relay = TRACK_RELAY_SECRET): each watcher (and guardian) is told by push. */
async function alert({ request, env }) {
  if (!env.TRACK_RELAY_SECRET || request.headers.get("X-Relay") !== env.TRACK_RELAY_SECRET) return json({ error: "forbidden" }, 403);
  const b = await readBody(request);
  const uid = Number(b?.user), kind = String(b?.kind || "");
  if (!uid || !trackPush.KINDS.includes(kind)) return json({ error: "bad request" }, 400);
  const who = await userById(env, uid);
  if (!who) return json({ ok: true, sent: 0 });
  if (who.guardian_wanted === 1) return json({ ok: true, sent: 0 });            // no alerts before a parent is attached
  const ids = await T.watcherIds(env, uid);
  let sent = 0;
  for (const id of ids) {
    const w = await userById(env, id);
    if (!w) continue;
    const row = await env.DB.prepare("SELECT alerts FROM track_watchers WHERE user_id = ? AND watcher_id = ?").bind(uid, id).first();
    const wants = parseJson(row?.alerts);
    if (wants && kind !== "help" && wants[kind] === false) continue;              // help always goes
    const msg = trackPush(userLang(w), kind, nameOf(who), b, uid);
    sent += await pushToUser(env, id, msg, { topic: `trk${uid}${kind}`, ttl: kind === "help" ? 3600 : 1800, native: true });
  }
  return json({ ok: true, sent });
}

// ---------------------------------------------------------------------------------------------------------------------
// accounts

async function meView({ env }, me) {
  const kids = await T.childrenOf(env, me.id);
  const { results: follow } = await env.DB.prepare(`SELECT u.* FROM track_watchers w JOIN users u ON u.id = w.user_id
    WHERE w.watcher_id = ? AND u.status = 'active'`).bind(me.id).all();
  const guardians = await T.guardiansOf(env, me.id);
  const polar = await env.DB.prepare("SELECT created_at FROM track_polar WHERE user_id = ?").bind(me.id).first().catch(() => null);
  return json({
    open: env.TRACK_OPEN === "1", admin: isAdmin(env, me),
    me: { ...accountOut(me), guardianWanted: me.guardian_wanted === 1, guardians: guardians.map((g) => ({ id: g.id, name: nameOf(g) })),
      canTakeOver: me.child === 1 && (T.ageOf(me) ?? 0) >= T.UNDER },
    children: kids.map(accountOut),
    following: follow.filter((u) => !kids.some((k) => k.id === u.id)).map(accountOut),
    settings: await T.settingsOf(env, me.id),
    polar: { available: !!(env.POLAR_CLIENT_ID && env.POLAR_CLIENT_SECRET), linked: !!polar },
  });
}

const birthOk = (y) => { const n = Number(y), now = new Date().getUTCFullYear(); return Number.isInteger(n) && n >= now - 25 && n <= now ? n : null; };

/** A child account (no e-mail, no password; docs/track/design.md « Data »). */
async function childCreate({ request, env }, me) {
  if (me.child) return json({ error: "forbidden" }, 403);
  if (!(await allow(env, `tchild:${me.id}`, 10, 86400))) return json({ error: "rate" }, 429);
  const b = await readBody(request);
  // (_lib/track.js createChild: shared with the entry form's « Ajouter un enfant », api/entries)
  const r = await T.createChild(env, me, { first: b?.first, last: b?.last, birthYear: b?.birthYear, licence: b?.licence, lang: b?.lang || userLang(me) });
  if (r.error) return json({ error: r.error }, r.status);
  return json({ ok: true, child: accountOut(r.child) });
}

async function childEdit({ request, env }, me, id) {
  if (!(await T.isGuardian(env, me.id, id))) return json({ error: "forbidden" }, 403);
  if (request.method === "PUT") {
    const b = await readBody(request) || {};
    const first = T.clean(b.first, 60), last = T.clean(b.last, 60), by = b.birthYear != null ? birthOk(b.birthYear) : undefined;
    if (b.first != null && !first) return json({ error: "fields" }, 422);
    if (by === null) return json({ error: "birthYear" }, 422);
    const u = await userById(env, id);
    const f = first || u.first_name, l = b.last != null ? last : u.last_name;
    await env.DB.prepare(`UPDATE users SET first_name = ?, last_name = ?, display_name = ?, birth_year = COALESCE(?, birth_year),
      lang = COALESCE(?, lang), licence = COALESCE(?, licence) WHERE id = ?`).bind(f, l, `${f} ${l}`.trim(), by ?? null,
      LANGS.includes(b.lang) ? b.lang : null, b.licence != null ? String(b.licence).replace(/\s+/g, "").slice(0, 12) : null, id).run();
    return json({ ok: true, child: accountOut(await userById(env, id)) });
  }
  if (request.method === "DELETE") {
    await T.deleteChild(env, id);
    return json({ ok: true });
  }
  return json({ error: "method" }, 405);
}

/** A code for an account I manage: « guardian » (another parent), « watch » (a watcher). -> { code, url } */
async function codeFor(ctx, me, kind, minutes) {
  const b = await readBody(ctx.request);
  const t = await target(ctx, me, b);
  if (t instanceof Response) return t;
  if (kind === "guardian" && !t.child) return json({ error: "forbidden" }, 403);
  if (!(await allow(ctx.env, `tcode:${me.id}`, 40, 86400))) return json({ error: "rate" }, 429);
  const code = await T.makeCode(ctx.env, kind, t.id, me.id, minutes);
  const page = kind === "guardian" ? "parent" : "suivre";
  return json({ code, url: `${siteUrl(ctx.env)}/#/famille?${page}=${encodeURIComponent(code)}`, expires: minutes * 60, name: nameOf(t) });
}

async function guardianAccept({ request, env }, me) {
  if (me.child) return json({ error: "forbidden" }, 403);
  const b = await readBody(request);
  const row = await T.takeCode(env, "guardian", String(b?.code || "").slice(0, 80));
  if (!row) return json({ error: "code" }, 400);
  await env.DB.prepare("INSERT INTO track_guardians (child_id, parent_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING")
    .bind(row.user_id, me.id, nowIso()).run();
  return json({ ok: true, child: accountOut(await userById(env, row.user_id)) });
}

/** An under-15's own account asks a parent: a code it sends them. */
async function attachCode({ env }, me) {
  if (me.child || me.guardian_wanted !== 1) return json({ error: "forbidden" }, 403);
  const code = await T.makeCode(env, "attach", me.id, me.id, 7 * 1440);
  return json({ code, url: `${siteUrl(env)}/#/famille?rattacher=${encodeURIComponent(code)}`, expires: 7 * 86400 });
}
async function attachAccept({ request, env }, me) {
  if (me.child) return json({ error: "forbidden" }, 403);
  const b = await readBody(request);
  const row = await T.takeCode(env, "attach", String(b?.code || "").slice(0, 80));
  if (!row || row.user_id === me.id) return json({ error: "code" }, 400);
  await env.DB.batch([
    env.DB.prepare("INSERT INTO track_guardians (child_id, parent_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING").bind(row.user_id, me.id, nowIso()),
    // its password kept: it signs in as before, managed by its parent from now on
    env.DB.prepare("UPDATE users SET child = 1, guardian_wanted = 0 WHERE id = ?").bind(row.user_id),
  ]);
  return json({ ok: true, child: accountOut(await userById(env, row.user_id)) });
}

async function pairCode(ctx, me) {
  const b = await readBody(ctx.request);
  // an account (a child's too) pairs its own devices — the iPhone app makes its Apple Watch's code this way; else one it manages
  const t = !accountParam(ctx.request, b) || accountParam(ctx.request, b) === me.id ? me : await target(ctx, me, b);
  if (t instanceof Response) return t;
  if (!(await allow(ctx.env, `tpc:${me.id}`, 30, 3600))) return json({ error: "rate" }, 429);
  const code = await T.makeCode(ctx.env, "pair", t.id, me.id, 15, 8);
  return json({ code, url: `${siteUrl(ctx.env)}/t/${code}`, expires: 900, name: nameOf(t) });
}

async function inviteAccept({ request, env }, me) {
  const b = await readBody(request);
  const row = await T.takeCode(env, "watch", String(b?.code || "").slice(0, 80));
  if (!row) return json({ error: "code" }, 400);
  if (row.user_id === me.id) return json({ error: "self" }, 400);
  await env.DB.prepare(`INSERT INTO track_watchers (user_id, watcher_id, granted_by, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT DO NOTHING`).bind(row.user_id, me.id, row.created_by, nowIso()).run();
  return json({ ok: true, account: accountOut(await userById(env, row.user_id)) });
}

const deviceOut = (d) => ({ id: d.id, kind: d.kind, label: d.label || d.model || "", platform: d.platform || "", model: d.model || "",
  version: d.app_version || "", battery: d.battery, lastSeen: d.last_seen, created: d.created_at, push: !!d.push_token, testOk: d.test_ok });

async function devices(ctx, me) {
  const t = await target(ctx, me, null);
  if (t instanceof Response) return t;
  const { results } = await ctx.env.DB.prepare(`SELECT * FROM track_devices WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at`).bind(t.id).all();
  return json({ devices: results.map(deviceOut) });
}

async function deviceClaim(ctx, me) {
  const b = await readBody(ctx.request);
  const t = await target(ctx, me, b);
  if (t instanceof Response) return t;
  if (!(await allow(ctx.env, `tdc:${me.id}`, 20, 3600))) return json({ error: "rate" }, 429);
  const code = T.cleanCode(b?.code);
  if (code.length !== 6) return json({ error: "code" }, 400);
  const since = new Date(Date.now() - 3600e3).toISOString();
  const d = await ctx.env.DB.prepare(`SELECT * FROM track_devices WHERE claim = ? AND user_id IS NULL AND revoked_at IS NULL
    AND last_seen > ? ORDER BY last_seen DESC LIMIT 1`).bind(code, since).first();
  if (!d) return json({ error: "code" }, 400);
  await ctx.env.DB.prepare("UPDATE track_devices SET user_id = ?, claim = NULL, label = COALESCE(?, label) WHERE id = ?")
    .bind(t.id, T.clean(b.label, 40) || null, d.id).run();
  return json({ ok: true, device: deviceOut({ ...d, user_id: t.id }) });
}

/** A Traccar Client device: its key in the address it posts to (the QR code configures the app). */
async function deviceOsmand(ctx, me) {
  const b = await readBody(ctx.request);
  const t = await target(ctx, me, b);
  if (t instanceof Response) return t;
  const id = T.newId("d_"), key = T.newKey();
  await ctx.env.DB.prepare(`INSERT INTO track_devices (id, user_id, kind, label, key_hash, created_at) VALUES (?, ?, 'osmand', ?, ?, ?)`)
    .bind(id, t.id, T.clean(b?.label, 40) || "Traccar Client", await T.hashOf(key), nowIso()).run();
  // the QR code is read by Traccar Client's own scanner: a plain address, the server its origin and path, its query the settings
  // (names and values as traccar-client's configuration_service reads them: lower-case « highest », snake_case stop_detection)
  const base = `${siteUrl(ctx.env)}/api/track/osmand/${key}`;
  const q = new URLSearchParams({ id, ...Object.fromEntries(Object.entries(TRACCAR_SETTINGS).map(([k, v]) => [k, String(v)])) });
  return json({ device: id, server: base, config: `${base}?${q}`, link: traccarLink(base, id), intent: traccarLink(base, id, true) });
}

async function deviceEdit(ctx, me, id) {
  const { request, env } = ctx;
  const d = await env.DB.prepare("SELECT * FROM track_devices WHERE id = ? AND revoked_at IS NULL").bind(id).first();
  if (!d || !(await T.canManage(env, me, d.user_id))) return json({ error: "forbidden" }, 403);
  if (request.method === "PUT") {
    const b = await readBody(request) || {};
    await env.DB.prepare("UPDATE track_devices SET label = ?, test_ok = COALESCE(?, test_ok) WHERE id = ?")
      .bind(T.clean(b.label, 40) || null, b.testOk ? nowIso() : null, id).run();
    return json({ ok: true });
  }
  if (request.method === "DELETE") {
    // removed: its next request gets 401 and it forgets its key; a run under way is told to stop
    await env.DB.prepare("UPDATE track_devices SET revoked_at = ?, push_token = NULL WHERE id = ?").bind(nowIso(), id).run();
    return json({ ok: true });
  }
  return json({ error: "method" }, 405);
}

async function watchers(ctx, me) {
  const { request, env } = ctx;
  if (request.method === "GET") {
    const t = await target(ctx, me, null);
    if (t instanceof Response) return t;
    const g = await T.guardiansOf(env, t.id);
    const { results } = await env.DB.prepare(`SELECT u.id, u.first_name, u.last_name, u.display_name, w.alerts, w.created_at FROM track_watchers w
      JOIN users u ON u.id = w.watcher_id WHERE w.user_id = ? ORDER BY w.created_at`).bind(t.id).all();
    return json({ guardians: g.map((u) => ({ id: u.id, name: u.display_name || nameOf(u) })),
      watchers: results.map((u) => ({ id: u.id, name: u.display_name || nameOf(u), since: u.created_at, alerts: parseJson(u.alerts) })) });
  }
  if (request.method === "DELETE") {
    const b = await readBody(request) || {};
    const id = Number(b.account) || me.id, w = Number(b.watcher);
    // the account (or its parent) removes a watcher, or a watcher leaves
    if (!(w === me.id || await T.canManage(env, me, id))) return json({ error: "forbidden" }, 403);
    await env.DB.prepare("DELETE FROM track_watchers WHERE user_id = ? AND watcher_id = ?").bind(id, w).run();
    return json({ ok: true });
  }
  if (request.method === "PUT") {              // a watcher's own choice of alerts for one account
    const b = await readBody(request) || {};
    const id = Number(b.account);
    const a = {};
    for (const k of trackPush.KINDS) if (b.alerts && typeof b.alerts[k] === "boolean") a[k] = b.alerts[k];
    await env.DB.prepare("UPDATE track_watchers SET alerts = ? WHERE user_id = ? AND watcher_id = ?").bind(JSON.stringify(a), id, me.id).run();
    return json({ ok: true });
  }
  return json({ error: "method" }, 405);
}

async function settings(ctx, me) {
  const { request, env } = ctx;
  if (request.method === "GET") {
    const t = await target(ctx, me, null);
    if (t instanceof Response) return t;
    return json(await T.settingsOf(env, t.id));
  }
  if (request.method !== "PUT") return json({ error: "method" }, 405);
  const b = await readBody(request) || {};
  const t = await target(ctx, me, b);
  if (t instanceof Response) return t;
  const cur = await T.settingsOf(env, t.id);
  const area = b.area === null ? null : b.area && Number.isFinite(+b.area.lat) && Number.isFinite(+b.area.lon) && +b.area.r >= 100
    ? { lat: +(+b.area.lat).toFixed(6), lon: +(+b.area.lon).toFixed(6), r: Math.min(20000, Math.round(+b.area.r)) } : cur.area;
  const call = b.call != null ? String(b.call).replace(/[^\d+ ]/g, "").slice(0, 20) : cur.call;
  await env.DB.prepare(`INSERT INTO track_settings (user_id, batch, cap, call, only_tracker, area) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET batch = excluded.batch, cap = excluded.cap, call = excluded.call,
    only_tracker = excluded.only_tracker, area = excluded.area`).bind(t.id,
    T.clamp(b.batch ?? cur.batch, T.BATCH_MIN, T.BATCH_MAX), T.clamp(b.cap ?? cur.cap, 1800, T.CAP_MAX), call || null,
    b.onlyTracker != null ? (b.onlyTracker ? 1 : 0) : cur.onlyTracker ? 1 : 0, area ? JSON.stringify(area) : null).run();
  return json(await T.settingsOf(env, t.id));
}

/** The accounts I may follow (myself, my children, those that let me) and each one's run under way. */
async function live({ env }, me) {
  const kids = await T.childrenOf(env, me.id);
  const { results: follow } = await env.DB.prepare(`SELECT u.* FROM track_watchers w JOIN users u ON u.id = w.user_id
    WHERE w.watcher_id = ? AND u.status = 'active'`).bind(me.id).all();
  const seen = new Set(), list = [];
  for (const [u, rel] of [[me, "me"], ...kids.map((k) => [k, "child"]), ...follow.map((f) => [f, "watch"])]) {
    if (seen.has(u.id)) continue;
    seen.add(u.id);
    const r = await env.DB.prepare(`SELECT * FROM track_runs WHERE user_id = ? ORDER BY started_at DESC LIMIT 1`).bind(u.id).first();
    const mine = rel !== "watch";
    const run = r && (mine || r.share === "watchers") ? runOut(r) : null;
    list.push({ ...accountOut(u), rel, run });
  }
  return json({ accounts: list });
}

const STALE_MS = 30 * 60e3;
function runOut(r) {
  const s = parseJson(r.summary) || {};
  const open = r.state !== "end" && Date.now() - Date.parse(r.last_at || r.started_at) < STALE_MS;
  return { id: r.id, source: r.source, device: r.device_id, start: r.started_at, end: r.ended_at, last: r.last_at,
    state: r.state === "end" ? "end" : open ? r.state : "lost", share: r.share, fixes: r.fixes, distance: Math.round(r.distance),
    name: r.name || "", kept: !!r.kept, pos: s.last ? [s.last[0] / 1e6, s.last[1] / 1e6] : s.start ? [s.start[0] / 1e6, s.start[1] / 1e6] : null,
    stoppedBy: s.stoppedBy || null };
}

async function runs(ctx, me) {
  const t = await target(ctx, me, null, "watch");
  if (t instanceof Response) return t;
  const mine = await T.canManage(ctx.env, me, t.id) || t.id === me.id;
  const { results } = await ctx.env.DB.prepare(`SELECT * FROM track_runs WHERE user_id = ? ${mine ? "" : "AND share = 'watchers'"}
    ORDER BY started_at DESC LIMIT 200`).bind(t.id).all();
  ctx.waitUntil(expire(ctx.env, t.id).catch(() => {}));
  return json({ account: accountOut(t), mine, runs: results.map(runOut) });
}

/** Runs older than KEEP_DAYS and not taken into an analysis or Mes cartes are deleted (checked when the list is read). */
async function expire(env, uid) {
  const before = new Date(Date.now() - T.KEEP_DAYS * 86400e3).toISOString();
  const { results } = await env.DB.prepare("SELECT id FROM track_runs WHERE user_id = ? AND kept = 0 AND started_at < ? LIMIT 20").bind(uid, before).all();
  for (const r of results) {
    await env.BUCKET.delete(T.runKey(uid, r.id));
    await env.DB.prepare("DELETE FROM track_runs WHERE id = ?").bind(r.id).run();
  }
}

async function runOne(ctx, me, id, sub, method) {
  const { env } = ctx;
  const r = await env.DB.prepare("SELECT * FROM track_runs WHERE id = ?").bind(id).first();
  if (!r) return json({ error: "run" }, 404);
  const manage = await T.canManage(env, me, r.user_id) || r.user_id === me.id;
  const watch = manage || (r.share === "watchers" && await T.canWatch(env, me, r.user_id));
  if (!watch) return json({ error: "forbidden" }, 403);
  if (!sub && method === "GET") return json({ run: runOut(r), trace: await T.runTrace(env, r.user_id, r.id) });
  if (sub === "gpx" && method === "GET") {
    const u = await userById(env, r.user_id);
    const name = r.name || `${nameOf(u || {})} ${r.started_at.slice(0, 16).replace("T", " ")}`;
    return new Response(T.gpxOf(await T.runTrace(env, r.user_id, r.id), name), { headers: { "Content-Type": "application/gpx+xml",
      "Content-Disposition": `attachment; filename="ozimut-${r.started_at.slice(0, 10)}.gpx"`, "Cache-Control": "no-store" } });
  }
  if (!manage) return json({ error: "forbidden" }, 403);
  if (!sub && method === "DELETE") {
    await T.deleteAllRunsOf(env, r.user_id, r.id);
    await env.DB.prepare("DELETE FROM track_runs WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  if (!sub && method === "PUT") {
    const b = await readBody(ctx.request) || {};
    await env.DB.prepare("UPDATE track_runs SET name = ?, share = COALESCE(?, share) WHERE id = ?")
      .bind(T.clean(b.name, 80) || null, ["watchers", "private"].includes(b.share) ? b.share : null, id).run();
    return json({ ok: true });
  }
  if (sub === "keep" && method === "POST") {
    await env.DB.prepare("UPDATE track_runs SET kept = 1 WHERE id = ?").bind(id).run();
    return json({ ok: true });
  }
  if (sub === "stop" && method === "POST") {
    // a parent (or the account) ends a run under way: the device is told at its next batch (stop: true)
    const s = parseJson(r.summary) || {};
    s.stoppedBy = me.id;
    await env.DB.prepare("UPDATE track_runs SET summary = ?, state = 'end', ended_at = COALESCE(ended_at, ?) WHERE id = ?")
      .bind(JSON.stringify(s), nowIso(), id).run();
    const lt = T.liveTrack(env, r.user_id);
    if (lt) ctx.waitUntil(lt.fetch("https://live/stop", { method: "POST", body: JSON.stringify({ run: id }) }).catch(() => {}));
    ctx.waitUntil(T.sealRun(env, r.user_id, id).catch(() => {}));
    return json({ ok: true });
  }
  return json({ error: "not found" }, 404);
}

/** A run of its own from a file (GPX read by the page, or a health app's route): « Mes traces ». */
async function runImport(ctx, me) {
  const b = await readBody(ctx.request);
  const t = await target(ctx, me, b);
  if (t instanceof Response) return t;
  if (!(await allow(ctx.env, `timp:${me.id}`, 60, 3600))) return json({ error: "rate" }, 429);
  const rec = b?.trace;
  if (!rec || rec.v !== 1 || !Array.isArray(rec.dt) || rec.dt.length < 2 || rec.dt.length > 100000) return json({ error: "trace" }, 400);
  const pts = T.decodeTrace(rec);
  if (pts.some((p) => !p.slice(0, 3).every(Number.isFinite))) return json({ error: "trace" }, 400);
  const clean = T.encodeTrace(pts);
  const t0 = clean.t0, id = `i_${new Date(t0 * 1000).toISOString().replace(/[-:]/g, "").slice(0, 15)}_${T.newId("", 4)}`;
  const src = ["file", "health", "polar"].includes(b.source) ? b.source : "file";
  let dist = 0;
  for (let i = 1; i < pts.length; i++) dist += T.metres(pts[i - 1][1], pts[i - 1][2], pts[i][1], pts[i][2]);
  await ctx.env.BUCKET.put(T.runKey(t.id, id), JSON.stringify(clean), { httpMetadata: { contentType: "application/json" } });
  const last = pts.at(-1);
  await ctx.env.DB.prepare(`INSERT INTO track_runs (id, user_id, source, started_at, ended_at, last_at, state, share, fixes, distance, name,
    summary, created_at) VALUES (?, ?, ?, ?, ?, ?, 'end', 'private', ?, ?, ?, ?, ?)`).bind(id, t.id, src, new Date(t0 * 1000).toISOString(),
    new Date(last[0] * 1000).toISOString(), nowIso(), pts.length, dist, T.clean(b.name, 80) || null,
    JSON.stringify({ start: [pts[0][1], pts[0][2], pts[0][0]], last: [last[1], last[2], last[0]], ext: T.clean(b.ext, 60) || undefined }), nowIso()).run();
  return json({ ok: true, run: id });
}

// ---------------------------------------------------------------------------------------------------------------------
// a child account becomes its own (from 15): its e-mail and password, confirmed by a link

async function takeover({ request, env }, me) {
  if (me.child !== 1) return json({ error: "forbidden" }, 403);
  if ((T.ageOf(me) ?? 0) < T.UNDER) return json({ error: "under15" }, 403);
  if (!(await allow(env, `ttake:${me.id}`, 5, 86400))) return json({ error: "rate" }, 429);
  const b = await readBody(request);
  const email = cleanEmail(b?.email), password = String(b?.password || "");
  if (!validEmail(email) || email.endsWith(`@${T.CHILD_DOMAIN}`)) return json({ error: "email" }, 422);
  if (password.length < 6 || password.length > 200) return json({ error: "password" }, 422);
  if (await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first()) return json({ error: "email_taken" }, 409);
  const pw = await hashPassword(password, env);
  const token = newToken();
  await env.BUCKET.put(`track/takeover/${me.id}.json`, JSON.stringify({ email, pw, token: await sha256hex(token), exp: Date.now() + 86400e3 }));
  await sendOrQueue(env, { to: email, ...takeoverMail(env, token, nameOf(me), userLang(me)), kind: "verify", priority: 1 });
  return json({ ok: true });
}
async function takeoverConfirm({ request, env }, me) {
  const b = await readBody(request);
  const obj = await env.BUCKET.get(`track/takeover/${me.id}.json`);
  const p = obj ? await obj.json() : null;
  if (!p || p.exp < Date.now() || p.token !== await sha256hex(String(b?.token || ""))) return json({ error: "token" }, 400);
  if (await env.DB.prepare("SELECT 1 FROM users WHERE email = ? AND id != ?").bind(p.email, me.id).first()) return json({ error: "email_taken" }, 409);
  const g = await T.guardiansOf(env, me.id);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET email = ?, pw_hash = ?, pw_salt = ?, pw_iter = ?, child = 0, guardian_wanted = 0 WHERE id = ?")
      .bind(p.email, p.pw.hash, p.pw.salt, p.pw.iter, me.id),
    // the parents stay watchers, of the young person's choosing from now on
    ...g.map((x) => env.DB.prepare(`INSERT INTO track_watchers (user_id, watcher_id, granted_by, created_at) VALUES (?, ?, ?, ?)
      ON CONFLICT DO NOTHING`).bind(me.id, x.id, me.id, nowIso())),
    env.DB.prepare("DELETE FROM track_guardians WHERE child_id = ?").bind(me.id),
  ]);
  await env.BUCKET.delete(`track/takeover/${me.id}.json`);
  const user = await userById(env, me.id);
  const rows = await memberships(env, user.id);
  return json({ ok: true }, 200, { "Set-Cookie": await sessionCookie(env, user, sessionCountries(user, rows)) });
}

// ---------------------------------------------------------------------------------------------------------------------
// Polar AccessLink (docs/track/design.md « Polar »)

const POLAR_AUTH = "https://flow.polar.com/oauth2/authorization", POLAR_TOKEN = "https://polarremote.com/v2/oauth2/token";
const POLAR_API = "https://www.polaraccesslink.com/v3";

async function polarConnect({ env }, me) {
  if (!env.POLAR_CLIENT_ID) return json({ error: "not configured" }, 503);
  const state = await T.makeCode(env, "web", me.id, me.id, 15);
  const u = new URL(POLAR_AUTH);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", env.POLAR_CLIENT_ID);
  u.searchParams.set("redirect_uri", `${siteUrl(env)}/api/track/polar/callback`);
  u.searchParams.set("state", state);
  return Response.redirect(u.toString(), 302);
}

async function polarCallback({ request, env }, me) {
  const q = new URL(request.url).searchParams;
  const back = (ok) => Response.redirect(`${siteUrl(env)}/#/mes-traces?polar=${ok ? "ok" : "erreur"}`, 302);
  const st = q.get("state") && await T.takeCode(env, "web", q.get("state"));
  if (!st || st.user_id !== me.id || !q.get("code")) return back(false);
  const basic = btoa(`${env.POLAR_CLIENT_ID}:${env.POLAR_CLIENT_SECRET}`);
  const res = await fetch(POLAR_TOKEN, { method: "POST", headers: { Authorization: `Basic ${basic}`, Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code: q.get("code"),
    redirect_uri: `${siteUrl(env)}/api/track/polar/callback` }) });
  if (!res.ok) return back(false);
  const tok = await res.json();
  // register the user with our client (409 = already registered: fine)
  const reg = await fetch(`${POLAR_API}/users`, { method: "POST", headers: { Authorization: `Bearer ${tok.access_token}`,
    "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ "member-id": `oz${me.id}` }) });
  if (!reg.ok && reg.status !== 409) return back(false);
  await env.DB.prepare(`INSERT INTO track_polar (user_id, polar_user, token, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET polar_user = excluded.polar_user, token = excluded.token`)
    .bind(me.id, String(tok.x_user_id), tok.access_token, nowIso()).run();
  return back(true);
}

async function polarUnlink({ env }, me) {
  const row = await env.DB.prepare("SELECT * FROM track_polar WHERE user_id = ?").bind(me.id).first();
  if (row) {
    await fetch(`${POLAR_API}/users/${row.polar_user}`, { method: "DELETE", headers: { Authorization: `Bearer ${row.token}` } }).catch(() => {});
    await env.DB.prepare("DELETE FROM track_polar WHERE user_id = ?").bind(me.id).run();
  }
  return json({ ok: true });
}

/** Polar's webhook: an exercise ready -> its GPX read and kept as a run of « Mes traces ». */
async function polarWebhook(ctx) {
  const { request, env } = ctx;
  const raw = await request.text();
  if (!env.POLAR_WEBHOOK_SECRET) return json({ error: "not configured" }, 503);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.POLAR_WEBHOOK_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)))].map((x) => x.toString(16).padStart(2, "0")).join("");
  if ((request.headers.get("Polar-Webhook-Signature") || "").toLowerCase() !== sig) return json({ error: "signature" }, 401);
  let ev;
  try { ev = JSON.parse(raw); } catch (e) { return json({ ok: true }); }
  if (ev.event === "PING") return json({ ok: true });
  if (ev.event !== "EXERCISE" || !ev.url) return json({ ok: true });
  const row = await env.DB.prepare("SELECT * FROM track_polar WHERE polar_user = ?").bind(String(ev.user_id)).first();
  if (!row) return json({ ok: true });
  ctx.waitUntil(polarFetch(env, row, ev).catch(() => {}));
  return json({ ok: true });
}
async function polarFetch(env, row, ev) {
  const res = await fetch(`${ev.url}/gpx`, { headers: { Authorization: `Bearer ${row.token}`, Accept: "application/gpx+xml" } });
  if (!res.ok) return;
  const pts = [];
  const xml = await res.text();
  const re = /<trkpt[^>]*lat="([-\d.]+)"[^>]*lon="([-\d.]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  let m;
  while ((m = re.exec(xml))) {
    const t = /<time>([^<]+)<\/time>/.exec(m[3]), e = /<ele>([^<]+)<\/ele>/.exec(m[3]);
    if (t) pts.push([Math.round(Date.parse(t[1]) / 1000), Math.round(+m[1] * 1e6), Math.round(+m[2] * 1e6), 0, e ? Math.round(+e[1]) : null]);
  }
  if (pts.length < 2) return;
  const rec = T.encodeTrace(pts), t0 = rec.t0;
  const id = `i_${new Date(t0 * 1000).toISOString().replace(/[-:]/g, "").slice(0, 15)}_${T.newId("", 4)}`;
  let dist = 0;
  const p2 = T.decodeTrace(rec);
  for (let i = 1; i < p2.length; i++) dist += T.metres(p2[i - 1][1], p2[i - 1][2], p2[i][1], p2[i][2]);
  await env.BUCKET.put(T.runKey(row.user_id, id), JSON.stringify(rec), { httpMetadata: { contentType: "application/json" } });
  await env.DB.prepare(`INSERT INTO track_runs (id, user_id, source, started_at, ended_at, last_at, state, share, fixes, distance, summary, created_at)
    VALUES (?, ?, 'polar', ?, ?, ?, 'end', 'private', ?, ?, ?, ?)`).bind(id, row.user_id, new Date(t0 * 1000).toISOString(),
    new Date(p2.at(-1)[0] * 1000).toISOString(), nowIso(), p2.length, dist,
    JSON.stringify({ start: [p2[0][1], p2[0][2], p2[0][0]], ext: `polar:${ev.entity_id || ""}` }), nowIso()).run();
}
