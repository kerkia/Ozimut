// Web Push (2026-10-18: a runner's start time on their phone as soon as the start list is published): the browser's push
// service (Google's for Chrome and Android, Mozilla's, Apple's, Microsoft's) receives the message and hands it to the device.
// The message is encrypted for the device (RFC 8291, aes128gcm): the push service carries it without reading it; the server
// proves who it is with VAPID (RFC 8292: a JWT signed with the site's key, ES256). WebCrypto only, no library.
//
// Keys: VAPID_PUBLIC_KEY (wrangler.toml [vars], public: the browsers subscribe with it) and VAPID_PRIVATE_KEY (a Pages
// secret, the key's « d », base64url), made together by tools/vapid.mjs. Without them, push is off (`pushReady`).

import { siteUrl } from "./api.js";

import { appToUser, nativeReady, nativeToUser } from "./nativepush.js";

const enc = new TextEncoder();

export const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4)), (c) => c.charCodeAt(0));
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
};

/** Are both VAPID keys there? */
export const pushReady = (env) => !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

/** The push services a subscription may point at: the server only ever posts to these (no address of the user's choosing). */
const HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.push\.apple\.com$/,
  /\.notify\.windows\.com$/];
export function validSubscription(s) {
  try {
    const u = new URL(String(s?.endpoint || ""));
    const p = unb64u(s?.keys?.p256dh || ""), a = unb64u(s?.keys?.auth || "");
    return u.protocol === "https:" && HOSTS.some((re) => re.test(u.hostname)) && s.endpoint.length <= 1000
      && p.length === 65 && p[0] === 4 && a.length === 16;
  } catch (e) {
    return false;
  }
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** RFC 8291: the payload encrypted for one subscription, as the body of the push request (one record). */
export async function encrypt(p256dh, auth, payload) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const local = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", local.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode("WebPush: info\0"), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const record = concat(enc.encode(payload), new Uint8Array([2]));              // the last (and only) record: delimiter 2
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, record));
  const rs = new Uint8Array([0, 0, 16, 0]);                                       // record size 4096, big-endian
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, sealed);
}

const signers = new Map();          // the site's signing key, imported once per isolate
async function signer(env) {
  const d = String(env.VAPID_PRIVATE_KEY).trim();          // (a secret piped in may end with a newline)
  if (!signers.has(d)) {
    const pub = unb64u(env.VAPID_PUBLIC_KEY);
    const jwk = { kty: "EC", crv: "P-256", d, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
    signers.set(d, await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]));
  }
  return signers.get(d);
}

/** RFC 8292: the Authorization header for a push service (its origin is the token's audience; valid 12 hours). */
export async function vapid(env, endpoint) {
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: siteUrl(env) })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await signer(env), enc.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

/**
 * Send one message to one subscription (a push_subs row). `msg` = { title, body, url, tag }: what the service worker
 * (site/sw-push.js) shows. `topic` replaces a message still waiting on the push service with the same topic (a start time
 * changed before the phone came back online). -> "ok", "gone" (the subscription is no more: delete it) or "failed".
 */
export async function sendPush(env, sub, msg, { topic = null, ttl = 4 * 86400 } = {}) {
  try {
    const body = await encrypt(sub.p256dh, sub.auth, JSON.stringify(msg));
    const headers = { Authorization: await vapid(env, sub.endpoint), TTL: String(ttl), "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream", Urgency: "normal" };
    if (topic) headers.Topic = String(topic).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32);
    const res = await fetch(sub.endpoint, { method: "POST", headers, body });
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "ok" : "failed";
  } catch (e) {
    return "failed";
  }
}

/** Send to every device of an account; drop the subscriptions gone, count the failures. -> number of devices reached. */
export async function pushToUser(env, userId, msg, opts) {
  // the tracking's alerts also go natively to the account's tracking phones (Folloz linked to Ozimut, _lib/nativepush.js);
  // nothing else of the site goes to the app (owner, 2026-11-23: Folloz shows tracking only, docs/track/folloz.md)
  let reached = opts?.native ? await nativeToUser(env, userId, msg, opts) : 0;
  // the Ozimut app (docs/app/design.md): every notification of the account, on the phones where it turned them on
  reached += await appToUser(env, userId, msg, opts);
  if (!pushReady(env)) return reached;
  const { results: subs } = await env.DB.prepare("SELECT * FROM push_subs WHERE user_id = ?").bind(userId).all();
  for (const s of subs) {
    const r = await sendPush(env, s, msg, opts);
    if (r === "ok") { reached++; await env.DB.prepare("UPDATE push_subs SET last_ok = ?, fails = 0 WHERE id = ?").bind(Date.now(), s.id).run(); }
    else if (r === "gone" || s.fails >= 9) await env.DB.prepare("DELETE FROM push_subs WHERE id = ?").bind(s.id).run();
    else await env.DB.prepare("UPDATE push_subs SET fails = fails + 1 WHERE id = ?").bind(s.id).run();
  }
  return reached;
}

/** A notification queued for an account (sent by flushPush, a few a call): a D1 statement, to run or batch. */
export const queuePush = (env, userId, kind, msg, { topic = null, hours = 72 } = {}) => env.DB.prepare(
  "INSERT INTO push_queue (user_id, kind, msg, topic, created_at, expires) VALUES (?, ?, ?, ?, ?, ?)")
  .bind(userId, kind, JSON.stringify(msg), topic, Date.now(), Date.now() + hours * 3600e3);

/** Send the oldest queued notifications, at most `max` (each is an encryption and a request per device). -> { pushSent, pushLeft } */
export async function flushPush(env, max = 8) {
  if (!pushReady(env) && !nativeReady(env)) return { pushSent: 0, pushLeft: 0 };
  try {
    await env.DB.prepare("DELETE FROM push_queue WHERE expires < ?").bind(Date.now()).run();
    const { results } = await env.DB.prepare("SELECT * FROM push_queue ORDER BY id LIMIT ?").bind(max).all();
    let pushSent = 0;
    for (const q of results) {
      await env.DB.prepare("DELETE FROM push_queue WHERE id = ?").bind(q.id).run();     // once, whatever comes of it
      let msg = null;
      try { msg = JSON.parse(q.msg); } catch (e) { continue; }
      const ttl = Math.max(60, Math.min(4 * 86400, Math.round((q.expires - Date.now()) / 1000)));
      if (await pushToUser(env, q.user_id, msg, { topic: q.topic, ttl })) pushSent++;
    }
    const left = await env.DB.prepare("SELECT COUNT(*) AS n FROM push_queue").first();
    return { pushSent, pushLeft: left.n };
  } catch (e) {
    return { pushSent: 0, pushLeft: 0 };               // before migration 0010
  }
}
