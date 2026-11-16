// The Tracer's storage (/api/tracer, functions/api/tracer/[[path]].js): the event, its map, versions, comments and field
// statuses — and, when the team chooses it, end-to-end encryption in the browser (AES-GCM, a key derived from the team's
// passphrase by PBKDF2): the server then stores bytes it cannot read. The passphrase stays in this tab's session.

const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (buf) => { let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export async function api(path, { method = "GET", body, type, headers = {}, raw = false } = {}) {
  const h = { ...headers };
  let payload;
  if (body instanceof Blob || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) { payload = body; h["Content-Type"] = type || body.type || "application/octet-stream"; }
  else if (typeof body === "string") { payload = body; h["Content-Type"] = type || "application/json"; }
  else if (body != null) { payload = JSON.stringify(body); h["Content-Type"] = "application/json"; }
  const r = await fetch(`api/tracer${path}`, { method, headers: h, body: payload, credentials: "same-origin" });
  if (raw && r.ok) return r;
  const ct = r.headers.get("content-type") || "";
  const data = ct.includes("json") ? await r.json().catch(() => null) : r.ok ? await r.arrayBuffer() : null;
  if (!r.ok) { const e = new Error(data?.error || `http ${r.status}`); e.status = r.status; e.code = data?.error; e.data = data; throw e; }
  return data;
}

// ---- encryption ---------------------------------------------------------------------------------------------------------
const CHECK = "ocn-tracer-ok";
const keyName = (id) => `ocn.tr.key.${id}`;
const KEYS = new Map();
export async function deriveKey(pass, saltB64, iter = 250000) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: unb64(saltB64), iterations: iter }, base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}
export async function encryptBytes(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, bytes));
  const out = new Uint8Array(4 + 12 + ct.length);
  out.set(enc.encode("OCN1"), 0); out.set(iv, 4); out.set(ct, 16);
  return out;
}
export async function decryptBytes(key, bytes) {
  const a = new Uint8Array(bytes);
  if (dec.decode(a.subarray(0, 4)) !== "OCN1") return a;          // not encrypted
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: a.subarray(4, 16) }, key, a.subarray(16)));
}
export const isEncrypted = (bytes) => { const a = new Uint8Array(bytes); return a.length > 16 && dec.decode(a.subarray(0, 4)) === "OCN1"; };
/** A new encryption setting from a passphrase: { salt, iter, check } (to store on the card) and the key. */
export async function newEncryption(pass) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16))), iter = 250000;
  const key = await deriveKey(pass, salt, iter);
  const check = b64(await encryptBytes(key, enc.encode(CHECK)));
  return { setting: { salt, iter, check }, key };
}
/** The key for an encrypted event from its passphrase, or null if the passphrase is wrong. */
export async function unlock(id, setting, pass) {
  try {
    const key = await deriveKey(pass, setting.salt, setting.iter);
    const ok = dec.decode(await decryptBytes(key, unb64(setting.check))) === CHECK;
    if (!ok) return null;
    KEYS.set(id, key);
    try { sessionStorage.setItem(keyName(id), b64(await crypto.subtle.exportKey("raw", key))); } catch (e) { /* this page only */ }
    return key;
  } catch (e) { return null; }
}
export async function keyFor(id) {
  if (KEYS.has(id)) return KEYS.get(id);
  try {
    const raw = sessionStorage.getItem(keyName(id));
    if (!raw) return null;
    const key = await crypto.subtle.importKey("raw", unb64(raw), { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
    KEYS.set(id, key);
    return key;
  } catch (e) { return null; }
}
export function setKey(id, key) {
  KEYS.set(id, key);
  if (!key) { try { sessionStorage.removeItem(keyName(id)); } catch (e) {} return; }
  crypto.subtle.exportKey("raw", key).then((raw) => { try { sessionStorage.setItem(keyName(id), b64(raw)); } catch (e) {} });
}
export function forgetKeys() { KEYS.clear(); try { for (const k of Object.keys(sessionStorage)) if (k.startsWith("ocn.tr.key.")) sessionStorage.removeItem(k); } catch (e) {} }

// ---- the event's parts --------------------------------------------------------------------------------------------------
async function getBlob(path, key) {
  const r = await fetch(`api/tracer${path}`, { credentials: "same-origin" });
  if (r.status === 404) return null;
  if (!r.ok) { const e = new Error(`http ${r.status}`); e.status = r.status; throw e; }
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("json") && path.endsWith("/comments") || ct.includes("json") && path.endsWith("/field")) {
    const j = await r.clone().json().catch(() => null);
    if (j?.empty) return null;
  }
  let bytes = new Uint8Array(await r.arrayBuffer());
  if (isEncrypted(bytes)) {
    if (!key) { const e = new Error("locked"); e.code = "locked"; throw e; }
    bytes = await decryptBytes(key, bytes);
  }
  return { bytes, type: ct, version: Number(r.headers.get("X-Version") || 0), by: r.headers.get("X-Updated-By") || "", at: r.headers.get("X-Updated") || "" };
}
async function put(path, bytes, type, key, headers = {}) {
  const body = key ? await encryptBytes(key, bytes) : bytes;
  return api(path, { method: path.endsWith("/versions") ? "POST" : "PUT", body, type: key ? "application/octet-stream" : type, headers });
}
export async function loadJson(id, part, key) {
  const b = await getBlob(`/${id}/${part}`, key);
  return b ? { data: JSON.parse(dec.decode(b.bytes)), version: b.version, by: b.by, at: b.at } : null;
}
export const saveEvent = (id, ev, key, baseVersion) => put(`/${id}/event`, enc.encode(JSON.stringify(ev)), "application/json", key, { "X-Base-Version": String(baseVersion) });
export const saveJson = (id, part, data, key) => put(`/${id}/${part}`, enc.encode(JSON.stringify(data)), "application/json", key);
export const saveVersion = (id, ev, key, note = "", summary = "") => put(`/${id}/versions`, enc.encode(JSON.stringify(ev)), "application/json", key,
  { "X-Note": encodeURIComponent(note.slice(0, 280)), "X-Summary": encodeURIComponent(summary.slice(0, 700)) });
export async function loadVersion(id, n, key) { const b = await getBlob(`/${id}/versions/${n}`, key); return b ? JSON.parse(dec.decode(b.bytes)) : null; }
export async function loadMap(id, key) {
  const b = await getBlob(`/${id}/map`, key);
  return b ? { bytes: b.bytes, type: b.type } : null;
}
export async function saveMap(id, bytes, type, key) { return put(`/${id}/map`, bytes, type, key); }
/** The event's other maps (the advanced level: ev.maps), stored beside the map as maps/<n>. */
export async function loadExtraMap(id, n, key) { const b = await getBlob(`/${id}/maps/${n}`, key); return b ? { bytes: b.bytes, type: b.type } : null; }
export async function saveExtraMap(id, n, bytes, type, key) { return put(`/${id}/maps/${n}`, bytes, type, key); }
export const deleteExtraMap = (id, n) => api(`/${id}/maps/${n}`, { method: "DELETE" });
/** The event's elevation model (relief.js: « OZD1 »), kept beside the map so that the whole team has the same heights. */
export async function loadDem(id, key) { const b = await getBlob(`/${id}/dem`, key); return b ? b.bytes : null; }
export const saveDem = (id, bytes, key) => put(`/${id}/dem`, bytes, "application/octet-stream", key);
export const deleteDem = (id) => api(`/${id}/dem`, { method: "DELETE" });
/** A control's photo (field mode): JPEG bytes, encrypted with the event's key when it has one. */
export const savePhoto = (id, pid, bytes, key) => put(`/${id}/photo/${pid}`, bytes, "image/jpeg", key);
export async function loadPhoto(id, pid, key) { const b = await getBlob(`/${id}/photo/${pid}`, key); return b ? new Blob([b.bytes], { type: "image/jpeg" }) : null; }
