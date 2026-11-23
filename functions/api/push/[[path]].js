// The account's devices for push notifications (2026-10-18; functions/_lib/push.js). Logged-in accounts only.
//   GET  /api/push              -> { ready, key, devices, enabled }: the VAPID public key to subscribe with, how many devices
//                                  the account has, and whether it wants any alert by push (users.push_*)
//   POST /api/push/subscribe    { subscription: { endpoint, keys: { p256dh, auth } }, label } — this device (again: a browser
//                                  renews its subscription now and then; an address another account had moves to this one)
//   POST /api/push/unsubscribe  { endpoint } — this device no longer
//   POST /api/push/test         -> { reached }: a test notification to the account's devices
//   POST /api/push/native       { kind: "fcm" | "apns", token, env, label } — the Ozimut app on this phone (docs/app/design.md):
//                                  the token its shell got from the system, sent by the page with its session
//   POST /api/push/native-off   { token } — this phone no longer
import { allow, json, readBody, userLang, withUser } from "../../_lib/api.js";
import { pushReady, pushToUser, validSubscription } from "../../_lib/push.js";
import { nativeReady } from "../../_lib/nativepush.js";
import { oldHosts } from "../../_middleware.js";
import { testPush } from "../../_lib/templates.js";

export const onRequestGet = withUser(async ({ env }, user) => {
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_subs WHERE user_id = ?").bind(user.id).first().catch(() => null);
  const a = await env.DB.prepare("SELECT COUNT(*) AS n FROM app_push WHERE user_id = ?").bind(user.id).first().catch(() => null);   // (none before migration 0032)
  return json({ ready: pushReady(env), native: nativeReady(env) && a !== null, key: env.VAPID_PUBLIC_KEY || null, devices: (n?.n || 0) + (a?.n || 0),
    enabled: [user.push_starts, user.push_results, user.push_agenda, user.push_deadline].some((v) => v === 1) || user.push_starts === undefined });
});

export const onRequestPost = withUser(async ({ request, env, params }, user) => {
  const action = (params.path || []).join("/");
  const b = (await readBody(request)) || {};
  if (action === "subscribe") {
    if (!pushReady(env)) return json({ error: "not configured" }, 503);
    if (!validSubscription(b.subscription)) return json({ error: "bad request" }, 400);
    if (!(await allow(env, `push-sub:${user.id}`, 30, 3600))) return json({ error: "too many" }, 429);
    const s = b.subscription, label = String(b.label || "").slice(0, 60) || null;
    const host = new URL(request.url).hostname, old = oldHosts(env);
    await env.DB.prepare(`INSERT INTO push_subs (user_id, endpoint, p256dh, auth, label, created_at, origin) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        label = excluded.label, fails = 0, origin = excluded.origin`).bind(user.id, s.endpoint, s.keys.p256dh, s.keys.auth, label,
      Date.now(), host).run();
    // the move to ozimut.com: a device that subscribes again on the new address leaves its old address's subscription
    // (same account, same label), which would otherwise send every notification twice
    if (label && !old.includes(host)) {
      await env.DB.prepare(`DELETE FROM push_subs WHERE user_id = ? AND label = ? AND endpoint <> ?
        AND (origin IS NULL OR origin IN (SELECT value FROM json_each(?)))`).bind(user.id, label, s.endpoint, JSON.stringify(old)).run();
    }
    return json({ ok: true });
  }
  if (action === "unsubscribe") {
    const endpoint = String(b.endpoint || "").slice(0, 1000);
    if (!endpoint) return json({ error: "bad request" }, 400);
    await env.DB.prepare("DELETE FROM push_subs WHERE endpoint = ? AND user_id = ?").bind(endpoint, user.id).run();
    return json({ ok: true });
  }
  if (action === "native") {
    if (!nativeReady(env)) return json({ error: "not configured" }, 503);
    const kind = b.kind === "apns" ? "apns" : b.kind === "fcm" ? "fcm" : null, token = String(b.token || "");
    if (!kind || !/^[A-Za-z0-9_:\-]{32,4096}$/.test(token)) return json({ error: "bad request" }, 400);
    if (!(await allow(env, `push-sub:${user.id}`, 30, 3600))) return json({ error: "too many" }, 429);
    try {
      await env.DB.prepare(`INSERT INTO app_push (user_id, kind, token, env, label, created_at) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (token) DO UPDATE SET user_id = excluded.user_id, kind = excluded.kind, env = excluded.env, label = excluded.label`)
        .bind(user.id, kind, token, b.env === "dev" ? "dev" : "prod", String(b.label || "").slice(0, 60) || null, Date.now()).run();
    } catch (e) { return json({ error: "not ready" }, 503); }               // before migration 0032
    return json({ ok: true });
  }
  if (action === "native-off") {
    const token = String(b.token || "").slice(0, 4096);
    if (!token) return json({ error: "bad request" }, 400);
    await env.DB.prepare("DELETE FROM app_push WHERE token = ? AND user_id = ?").bind(token, user.id).run().catch(() => {});
    return json({ ok: true });
  }
  if (action === "test") {
    if (!pushReady(env) && !nativeReady(env)) return json({ error: "not configured" }, 503);
    if (!(await allow(env, `push-test:${user.id}`, 6, 3600))) return json({ error: "too many" }, 429);
    const reached = await pushToUser(env, user.id, testPush(userLang(user)), { ttl: 600 });
    return json({ reached });
  }
  return json({ error: "not found" }, 404);
});
