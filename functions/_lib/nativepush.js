// Native notifications to the Ozimut app (docs/track/design.md « Native push tokens »): Firebase Cloud Messaging (HTTP v1)
// for Android, Apple Push Notification service for the iPhone. Each device row of track_devices may hold one token; every
// notification the site sends to an account (functions/_lib/push.js pushToUser) also goes there.
// Secrets (Pages, the owner's): FCM_SERVICE_ACCOUNT (the service account's JSON), APNS_KEY (the .p8 key's text), APNS_KEY_ID,
// APNS_TEAM_ID, APNS_TOPIC ("com.ozimut.app"). Without them nothing is sent natively.
// Not yet tried against the real services: APNs needs HTTP/2, which the Workers' fetch is expected (not verified) to use.

const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const fcmReady = (env) => !!env.FCM_SERVICE_ACCOUNT;
export const apnsReady = (env) => !!(env.APNS_KEY && env.APNS_KEY_ID && env.APNS_TEAM_ID);
export const nativeReady = (env) => fcmReady(env) || apnsReady(env);

const enc = new TextEncoder();
const jsonB64 = (o) => b64u(enc.encode(JSON.stringify(o)));
function pemBytes(pem) {
  const body = String(pem).replace(/-----[^-]+-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

let fcmToken = null, fcmExp = 0, apnsJwt = null, apnsExp = 0;

async function fcmAccess(env) {
  if (fcmToken && Date.now() < fcmExp) return fcmToken;
  const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${jsonB64({ alg: "RS256", typ: "JWT" })}.${jsonB64({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })}`;
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned));
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64u(sig)}` }) });
  if (!res.ok) throw new Error(`fcm token ${res.status}`);
  const j = await res.json();
  fcmToken = j.access_token; fcmExp = Date.now() + 50 * 60e3;
  return fcmToken;
}

async function apnsToken(env) {
  if (apnsJwt && Date.now() < apnsExp) return apnsJwt;
  const unsigned = `${jsonB64({ alg: "ES256", kid: env.APNS_KEY_ID })}.${jsonB64({ iss: env.APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })}`;
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(env.APNS_KEY), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned));     // raw r‖s, as JWS wants
  apnsJwt = `${unsigned}.${b64u(sig)}`; apnsExp = Date.now() + 50 * 60e3;
  return apnsJwt;
}

/** One notification to one device row. -> "ok" | "gone" (the token is no more: forget it) | "failed" | "off" */
export async function sendNative(env, d, msg, { ttl = 4 * 86400 } = {}) {
  try {
    if (d.push_kind === "fcm" && fcmReady(env)) {
      const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT);
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, { method: "POST",
        headers: { Authorization: `Bearer ${await fcmAccess(env)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token: d.push_token,
          notification: { title: String(msg.title || "").slice(0, 200), body: String(msg.body || "").slice(0, 1000) },
          data: { url: String(msg.url || "/"), tag: String(msg.tag || "") },
          android: { priority: msg.urgent ? "high" : "normal", ttl: `${ttl}s`,
            notification: { channel_id: msg.urgent ? "help" : "alerts", tag: String(msg.tag || "") } } } }) });
      if (res.status === 404 || res.status === 400) {
        const t = await res.text();
        return /UNREGISTERED|INVALID_ARGUMENT/.test(t) ? "gone" : "failed";
      }
      return res.ok ? "ok" : "failed";
    }
    if (d.push_kind === "apns" && apnsReady(env)) {
      const host = d.push_env === "dev" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
      const res = await fetch(`https://${host}/3/device/${d.push_token}`, { method: "POST",
        headers: { authorization: `bearer ${await apnsToken(env)}`, "apns-topic": env.APNS_TOPIC || "com.ozimut.app",
          "apns-push-type": "alert", "apns-priority": "10", "apns-expiration": String(Math.floor(Date.now() / 1000) + ttl),
          ...(msg.tag ? { "apns-collapse-id": String(msg.tag).slice(0, 64) } : {}) },
        body: JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: "default",
          ...(msg.urgent ? { "interruption-level": "time-sensitive" } : {}) }, url: msg.url || "/" }) });
      if (res.status === 410) return "gone";
      if (res.status === 400) return /BadDeviceToken|DeviceTokenNotForTopic/.test(await res.text()) ? "gone" : "failed";
      return res.ok ? "ok" : "failed";
    }
    return "off";
  } catch (e) {
    return "failed";
  }
}

/** An Ozitrac alert (docs/track/ozitrac.md « Notifications »): data only, the app writes the words with the name it holds.
 *  `p` = { kind: "fcm" | "apns", token, env }. -> "ok" | "gone" | "failed" | "off" */
export async function sendData(env, p, data, { urgent = false, ttl = 3600 } = {}) {
  const strings = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v ?? "")]));
  try {
    if (p.kind === "fcm" && fcmReady(env)) {
      const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT);
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, { method: "POST",
        headers: { Authorization: `Bearer ${await fcmAccess(env)}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token: p.token, data: strings, android: { priority: urgent ? "high" : "normal", ttl: `${ttl}s` } } }) });
      if (res.status === 404 || res.status === 400) return /UNREGISTERED|INVALID_ARGUMENT/.test(await res.text()) ? "gone" : "failed";
      return res.ok ? "ok" : "failed";
    }
    if (p.kind === "apns" && apnsReady(env)) {
      // the iPhone app (to come) localises the words from the key and fills the name in its notification extension
      const host = p.env === "dev" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
      const res = await fetch(`https://${host}/3/device/${p.token}`, { method: "POST",
        headers: { authorization: `bearer ${await apnsToken(env)}`, "apns-topic": env.OZITRAC_APNS_TOPIC || "com.ozimut.ozitrac",
          "apns-push-type": "alert", "apns-priority": "10", "apns-expiration": String(Math.floor(Date.now() / 1000) + ttl) },
        body: JSON.stringify({ aps: { alert: { "loc-key": `OZ_ALERT_${strings.kind.toUpperCase()}` }, sound: "default", "mutable-content": 1,
          ...(urgent ? { "interruption-level": "time-sensitive" } : {}) }, ...strings }) });
      if (res.status === 410) return "gone";
      if (res.status === 400) return /BadDeviceToken|DeviceTokenNotForTopic/.test(await res.text()) ? "gone" : "failed";
      return res.ok ? "ok" : "failed";
    }
    return "off";
  } catch (e) {
    return "failed";
  }
}

/** Every native device of an account. -> number reached */
export async function nativeToUser(env, userId, msg, opts) {
  if (!nativeReady(env)) return 0;
  let rows = [];
  try {
    ({ results: rows } = await env.DB.prepare(`SELECT id, push_kind, push_token, push_env FROM track_devices
      WHERE user_id = ? AND revoked_at IS NULL AND push_token IS NOT NULL`).bind(userId).all());
  } catch (e) { return 0; }                     // before migration 0029
  let reached = 0;
  for (const d of rows) {
    const r = await sendNative(env, d, msg, opts);
    if (r === "ok") reached++;
    else if (r === "gone") await env.DB.prepare("UPDATE track_devices SET push_token = NULL WHERE id = ?").bind(d.id).run();
  }
  return reached;
}
