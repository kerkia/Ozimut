// Stripe without its SDK (docs/billing/design.md §5): fetch to its API with form-encoded bodies, a pinned API version, an
// idempotency key on every write, and the webhook's signature checked with WebCrypto. Secrets (Pages secrets, the owner's):
// STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET — never logged, never returned. STRIPE_API (local rehearsal only) points at
// tools/billing/fake_stripe.mjs.

// The version every call is made with, whatever the account's default becomes. Its subscriptions carry
// current_period_start / current_period_end and its invoices payment_intent / charge, which _lib/billing.js reads (later
// versions moved them: change the readers with this constant).
export const STRIPE_VERSION = "2024-06-20";
const TOLERANCE_S = 300;            // a webhook's timestamp may be this old (or this far ahead)

/** Both secrets are present. */
export const stripeReady = (env) => !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET);

/** { a: { b: [1, { c: 2 }] } } → « a[b][0]=1&a[b][1][c]=2 » (Stripe's bracket syntax); null and undefined left out. */
export function encodeForm(params) {
  const out = [];
  const put = (key, v) => {
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) v.forEach((x, i) => put(`${key}[${i}]`, x));
    else if (typeof v === "object") for (const [k, x] of Object.entries(v)) put(`${key}[${k}]`, x);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(typeof v === "boolean" ? (v ? "true" : "false") : String(v))}`);
  };
  for (const [k, v] of Object.entries(params || {})) put(k, v);
  return out.join("&");
}

/**
 * One call. method GET | POST | DELETE; path « /v1/… »; params an object (the query for a GET, the body otherwise).
 * idem: the write's idempotency key (one is made when none is given: a retry by the network layer is then not a second
 * write). Resolves with Stripe's object; rejects with { status, code, message } (status 0: Stripe not reached).
 */
export async function stripe(env, method, path, params, { idem } = {}) {
  if (!env.STRIPE_SECRET_KEY) throw { status: 503, code: "not_configured", message: "Stripe is not configured" };
  const m = String(method || "GET").toUpperCase(), form = encodeForm(params);
  const base = String(env.STRIPE_API || "https://api.stripe.com").replace(/\/+$/, "");
  const headers = { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Stripe-Version": STRIPE_VERSION };
  const init = { method: m, headers };
  let url = base + path;
  if (m === "GET") { if (form) url += (url.includes("?") ? "&" : "?") + form; }
  else {
    headers["Idempotency-Key"] = String(idem || crypto.randomUUID()).slice(0, 255);
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    init.body = form;
  }
  let res;
  try { res = await fetch(url, init); } catch (e) { throw { status: 0, code: "network", message: "Stripe could not be reached" }; }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.error) {
    const e = body?.error || {};
    throw { status: res.status || 500, code: String(e.code || e.type || "error"), message: String(e.message || `Stripe answered ${res.status}`).slice(0, 300) };
  }
  return body;
}

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
/** Constant-time comparison of two strings of hex digits. */
function same(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/** HMAC-SHA-256 of « t.body » with the secret, as hex: what Stripe writes after « v1= ». */
export async function signature(secret, t, body) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${body}`)));
}
/** Does the header « t=…,v1=…[,v1=…] » sign this body with this secret, within the tolerance? (several v1: a rolled secret) */
export async function checkSignature(secret, header, body, nowS = Math.floor(Date.now() / 1000)) {
  if (!secret || !header) return false;
  let t = null;
  const v1 = [];
  for (const part of String(header).split(",")) {
    const i = part.indexOf("="), k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === "t") t = v; else if (k === "v1") v1.push(v.toLowerCase());
  }
  if (!t || !/^\d{1,12}$/.test(t) || !v1.length || Math.abs(nowS - Number(t)) > TOLERANCE_S) return false;
  const want = await signature(secret, t, body);
  let ok = false;
  for (const v of v1.slice(0, 8)) ok = same(v, want) || ok;         // every candidate compared: no early exit
  return ok;
}

/** The event a webhook request carries, once its signature is checked; null for anything else. */
export async function verifyWebhook(env, request) {
  if (!env.STRIPE_WEBHOOK_SECRET) return null;
  const raw = await request.text();
  if (!raw || raw.length > 2e6) return null;
  if (!(await checkSignature(env.STRIPE_WEBHOOK_SECRET, request.headers.get("Stripe-Signature"), raw))) return null;
  try {
    const ev = JSON.parse(raw);
    return ev && typeof ev === "object" && typeof ev.id === "string" && typeof ev.type === "string" && ev.data?.object ? ev : null;
  } catch (e) { return null; }
}
