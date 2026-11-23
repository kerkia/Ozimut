// Live GPS tracking (docs/track/design.md): who may use it, who may see whom, the devices' keys, the batches of fixes and
// the runs kept in R2. Shared by functions/api/track/[[path]].js, functions/ws/track/[user].js and functions/t/[[path]].js.

import { isAdmin, nowIso, previewOf } from "./api.js";
import { b64url, randomBytes, sha256hex } from "./crypto.js";

export const CODE_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";       // no 0/O, 1/I: read on a watch, typed by hand
export const ID36 = "abcdefghijklmnopqrstuvwxyz0123456789";
export const newCode = (n = 8) => Array.from(randomBytes(n), (b) => CODE_ALPHA[b % 32]).join("");
export const newId = (prefix, n = 10) => `${prefix}${Array.from(randomBytes(n), (b) => ID36[b % 36]).join("")}`;
export const newKey = () => b64url(randomBytes(36));                // 48 characters
export const hashOf = (s) => sha256hex(String(s));
export const cleanCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

export const BATCH_MIN = 10, BATCH_MAX = 60, IDLE_NEXT = 120, CAP_DEFAULT = 9000, CAP_MAX = 6 * 3600;
export const MAX_FIXES = 600;                                        // a batch's fixes, at most (else 413: split)
export const KEEP_DAYS = 30;                                         // an unused run's life in « Mes traces »
export const CHILD_DOMAIN = "ozimut.invalid";                        // a child account's address: receives nothing

/** Before migration 0029: the tables are not there. */
export const missing = (e) => /no such (table|column)/i.test(String(e?.message || e));

/** The age an account declared this year (null when unknown). */
export const ageOf = (u) => (u?.birth_year ? new Date().getUTCFullYear() - Number(u.birth_year) : null);
export const UNDER = 15;

/** May this account use the tracking pages at all? Everyone with TRACK_OPEN "1"; until then the administrators (owner,
 *  2026-11-22: « visible to admin only for now »), the accounts whose users.preview names « track » (owner, 2026-11-23: two
 *  family testers, set by hand in D1) and the child accounts they made (a child's phone pairs its own watch). */
export const trackTester = (user) => previewOf(user).includes("track");
export async function trackAllowed(env, user) {
  if (!user) return false;
  if (env.TRACK_OPEN === "1" || isAdmin(env, user) || trackTester(user)) return true;
  return user.child === 1;
}

/** The accounts this one manages (its children). */
export async function childrenOf(env, uid) {
  const { results } = await env.DB.prepare(`SELECT u.* FROM track_guardians g JOIN users u ON u.id = g.child_id
    WHERE g.parent_id = ? AND u.status = 'active' ORDER BY u.first_name`).bind(uid).all();
  return results;
}
export async function guardiansOf(env, uid) {
  const { results } = await env.DB.prepare(`SELECT u.id, u.first_name, u.last_name, u.display_name FROM track_guardians g
    JOIN users u ON u.id = g.parent_id WHERE g.child_id = ?`).bind(uid).all();
  return results;
}
export const isGuardian = async (env, parentId, childId) =>
  !!(await env.DB.prepare("SELECT 1 FROM track_guardians WHERE parent_id = ? AND child_id = ?").bind(parentId, childId).first());

/** May `me` manage the account `id` (its devices, watchers, settings)? Itself — a child only with its parent's say, so not —,
 *  or one of its guardians. */
export async function canManage(env, me, id) {
  if (!me) return false;
  if (Number(id) === me.id) return !me.child;
  return isGuardian(env, me.id, Number(id));
}
/** May `me` see `id`'s runs and follow it live? Itself, a guardian, or a watcher it allowed. */
export async function canWatch(env, me, id) {
  if (!me) return false;
  id = Number(id);
  if (id === me.id) return true;
  if (await isGuardian(env, me.id, id)) return true;
  return !!(await env.DB.prepare("SELECT 1 FROM track_watchers WHERE user_id = ? AND watcher_id = ?").bind(id, me.id).first());
}

/** An account's tracking settings, its defaults filled. */
export async function settingsOf(env, uid) {
  let s = null;
  try { s = await env.DB.prepare("SELECT * FROM track_settings WHERE user_id = ?").bind(uid).first(); } catch (e) { /* none */ }
  let area = null;
  try { area = s?.area ? JSON.parse(s.area) : null; } catch (e) { area = null; }
  return { fix: 1, batch: clamp(s?.batch ?? 30, BATCH_MIN, BATCH_MAX), idle: IDLE_NEXT, cap: clamp(s?.cap ?? CAP_DEFAULT, 1800, CAP_MAX),
    call: s?.call || "", onlyTracker: !!s?.only_tracker, area };
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v) || 0)));

/** The names of an account's watchers (its guardians first), as a tracked device shows them. */
export async function watcherNames(env, uid) {
  const g = await guardiansOf(env, uid);
  const { results: w } = await env.DB.prepare(`SELECT u.id, u.first_name, u.display_name FROM track_watchers t JOIN users u
    ON u.id = t.watcher_id WHERE t.user_id = ? AND u.status = 'active'`).bind(uid).all();
  const seen = new Set(), out = [];
  for (const u of [...g, ...w]) if (!seen.has(u.id)) { seen.add(u.id); out.push(u.first_name || u.display_name); }
  return out;
}
/** The accounts to tell about a run (alerts): guardians and watchers. */
export async function watcherIds(env, uid) {
  const { results } = await env.DB.prepare(`SELECT parent_id AS id FROM track_guardians WHERE child_id = ?1
    UNION SELECT watcher_id AS id FROM track_watchers WHERE user_id = ?1`).bind(uid).all();
  return results.map((r) => r.id);
}

/** The device behind a request's `Authorization: Bearer <key>`, not revoked, its account active — or null. */
export async function deviceOf(env, request) {
  const m = /^Bearer\s+([A-Za-z0-9_-]{20,80})$/.exec(request.headers.get("Authorization") || "");
  return m ? deviceByKey(env, m[1]) : null;
}
export async function deviceByKey(env, key) {
  const h = await hashOf(key);
  const d = await env.DB.prepare("SELECT * FROM track_devices WHERE key_hash = ? AND revoked_at IS NULL").bind(h).first();
  if (!d) return null;
  if (!d.user_id) return { ...d, pending: true };
  const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(d.user_id).first();
  return u && u.status === "active" ? { ...d, user: u } : null;
}

/** A short-lived code of a kind for an account (pair, watch, guardian, attach, web): stored hashed. -> the code */
export async function makeCode(env, kind, userId, createdBy, minutes, len = 8) {
  const code = kind === "web" || kind === "watch" || kind === "guardian" || kind === "attach" ? b64url(randomBytes(18)) : newCode(len);
  await env.DB.prepare("INSERT INTO track_codes (code_hash, kind, user_id, created_by, expires_at) VALUES (?, ?, ?, ?, ?)")
    .bind(await hashOf(kind + ":" + code), kind, userId, createdBy, Date.now() + minutes * 60e3).run();
  return code;
}
/** A code taken (once): its row, or null when unknown, used or expired. */
export async function takeCode(env, kind, code) {
  const h = await hashOf(kind + ":" + code);
  const r = await env.DB.prepare(`UPDATE track_codes SET used = 1 WHERE code_hash = ? AND used = 0 AND expires_at > ? RETURNING *`)
    .bind(h, Date.now()).first();
  return r || null;
}

/** A batch of fixes checked and made absolute: { t, la, lo, ac, al } arrays of the same length, or an error string. */
export function readBatch(b) {
  if (!b || b.v !== 1) return "version";
  const dt = b.dt || [], la = b.la || [], lo = b.lo || [];
  if (![dt, la, lo].every(Array.isArray) || dt.length !== la.length || dt.length !== lo.length) return "arrays";
  if (dt.length > MAX_FIXES) return "size";
  const ac = Array.isArray(b.ac) && b.ac.length === dt.length ? b.ac : null;
  const alIn = Array.isArray(b.al) && b.al.length === dt.length ? b.al : null;
  const out = { t: [], la: [], lo: [], ac: [], al: alIn ? [] : null };
  let t = Number(b.t0), a = 0, o = 0, z = 0;
  if (dt.length && !Number.isFinite(t)) return "t0";
  for (let i = 0; i < dt.length; i++) {
    const d = Number(dt[i]), x = Number(la[i]), y = Number(lo[i]);
    if (![d, x, y].every(Number.isFinite)) return "value";
    if (i) t += d;
    a = i ? a + x : x; o = i ? o + y : y;
    if (Math.abs(a) > 90e6 || Math.abs(o) > 180e6) return "range";
    out.t.push(t); out.la.push(a); out.lo.push(o);
    out.ac.push(ac ? Math.max(0, Math.round(Number(ac[i]) || 0)) : 0);
    if (alIn) { z = i ? z + Number(alIn[i]) || z : Number(alIn[i]) || 0; out.al.push(z); }
  }
  return out;
}
/** Metres between two fixes (millionths of a degree). */
export function metres(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180 / 1e6;
  const dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** A batch's distance, from the previous batch's last fix (`prev` [la, lo]) when given; jumps of over 100 m a second left out. */
export function distanceOf(f, prev = null) {
  let d = 0, p = prev, pt = null;
  for (let i = 0; i < f.t.length; i++) {
    if (p) {
      const m = metres(p[0], p[1], f.la[i], f.lo[i]), s = pt == null ? 1 : Math.max(1, f.t[i] - pt);
      if (m / s < 100 && (f.ac[i] || 0) < 100) d += m;
    }
    p = [f.la[i], f.lo[i]]; pt = f.t[i];
  }
  return d;
}

export const batchKey = (uid, run, seq) => `track/${uid}/${run}/${String(seq).padStart(6, "0")}.json`;
export const runKey = (uid, run) => `track/${uid}/${run}.json`;

/** A run's fixes in the analyses' stored trace form (trace/share.js: { v: 1, t0, dt, la, lo } as deltas; plus ac and al),
 *  put together from its batches (or from its whole file once written). */
export async function runTrace(env, uid, run) {
  const whole = await env.BUCKET.get(runKey(uid, run));
  if (whole) return whole.json();
  const pts = [];
  let cursor;
  do {
    const page = await env.BUCKET.list({ prefix: `track/${uid}/${run}/`, cursor });
    for (const o of page.objects) {
      const b = await (await env.BUCKET.get(o.key))?.json();
      if (b?.t) for (let i = 0; i < b.t.length; i++) pts.push([b.t[i], b.la[i], b.lo[i], b.ac[i] || 0, b.al ? b.al[i] : null]);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return encodeTrace(pts);
}
/** Points [t, la, lo, ac, al] (absolute) → the trace form, sorted by time, one point a second at most. */
export function encodeTrace(pts) {
  pts.sort((a, b) => a[0] - b[0]);
  const out = { v: 1, t0: pts.length ? pts[0][0] : 0, dt: [], la: [], lo: [], ac: [] };
  const hasAl = pts.some((p) => p[4] != null);
  if (hasAl) out.al = [];
  let pt = null, pla = 0, plo = 0, pal = 0;
  for (const p of pts) {
    if (pt != null && p[0] <= pt) continue;
    const first = pt == null;
    out.dt.push(first ? 0 : p[0] - pt); out.la.push(first ? p[1] : p[1] - pla); out.lo.push(first ? p[2] : p[2] - plo);
    out.ac.push(p[3] || 0);
    if (hasAl) { const al = Math.round(p[4] ?? pal); out.al.push(first ? al : al - pal); pal = al; }
    pt = p[0]; pla = p[1]; plo = p[2];
  }
  return out;
}
/** The trace form back to points [t, la, lo, ac, al]. */
export function decodeTrace(rec) {
  const out = [];
  let t = rec.t0 || 0, la = 0, lo = 0, al = 0;
  for (let i = 0; i < (rec.dt || []).length; i++) {
    t += rec.dt[i]; la += rec.la[i]; lo += rec.lo[i];
    if (rec.al) al += rec.al[i];
    out.push([t, la, lo, rec.ac ? rec.ac[i] : 0, rec.al ? al : null]);
  }
  return out;
}
/** A GPX of a run's trace. */
export function gpxOf(rec, name) {
  const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);
  const pts = decodeTrace(rec).map(([t, la, lo, , al]) => `<trkpt lat="${(la / 1e6).toFixed(6)}" lon="${(lo / 1e6).toFixed(6)}">${al != null
    ? `<ele>${al}</ele>` : ""}<time>${new Date(t * 1000).toISOString().replace(/\.\d+Z$/, "Z")}</time></trkpt>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Ozimut" xmlns="http://www.topografix.com/GPX/1/1">\n`
    + `<trk><name>${esc(name || "Ozimut")}</name><trkseg>\n${pts}\n</trkseg></trk>\n</gpx>\n`;
}
/** A run's whole file written (at its end), its batches deleted. */
export async function sealRun(env, uid, run) {
  const rec = await runTrace(env, uid, run);
  await env.BUCKET.put(runKey(uid, run), JSON.stringify(rec), { httpMetadata: { contentType: "application/json" } });
  let cursor;
  do {
    const page = await env.BUCKET.list({ prefix: `track/${uid}/${run}/`, cursor });
    if (page.objects.length) await env.BUCKET.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return rec;
}
/** One run's stored fixes deleted (its batches and its whole file). */
export async function deleteAllRunsOf(env, uid, run) {
  await env.BUCKET.delete(runKey(uid, run));
  let cursor;
  do {
    const page = await env.BUCKET.list({ prefix: `track/${uid}/${run}/`, cursor });
    if (page.objects.length) await env.BUCKET.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}
/** Every stored fix of an account deleted (account deletion). */
export async function deleteAllRuns(env, uid) {
  let cursor;
  do {
    const page = await env.BUCKET.list({ prefix: `track/${uid}/`, cursor });
    if (page.objects.length) await env.BUCKET.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
}

/** The live object of a followed account (live relay « ocn-live », LiveTrack), or null when not bound. */
export const liveTrack = (env, uid) => (env.LIVE_TRACK ? env.LIVE_TRACK.get(env.LIVE_TRACK.idFromName(`u${uid}`)) : null);

/** A run's display name: « Course du 21/11 à 9 h 35 » is the page's; here the time it started (UTC ISO). */
export const runStart = (run) => {
  const m = /^r_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(run || "");
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : nowIso();
};
export const RUN_ID = /^[ri]_\d{8}T\d{6}_[a-z0-9]{4,8}$/;

/** A child's year of birth as accepted (25 years back at most), else null. */
export const childBirth = (y) => { const n = Number(y), now = new Date().getUTCFullYear(); return Number.isInteger(n) && n >= now - 25 && n <= now ? n : null; };

/**
 * A child account made by its parent `me` (no e-mail, no password; docs/track/design.md « Data »): the tracking's « Famille »
 * and the entry form's « Ajouter un enfant » (docs/clubs/design.md §3), whatever TRACK_OPEN says. `f`: { first, last,
 * birthYear, licence, lang }. -> { ok, child (the users row) } or { error, status }.
 */
export async function createChild(env, me, f = {}) {
  if (me.child) return { error: "forbidden", status: 403 };
  const first = clean(f.first, 60), last = clean(f.last, 60) || me.last_name || "", by = childBirth(f.birthYear);
  if (!first) return { error: "fields", status: 422 };
  if (!by) return { error: "birthYear", status: 422 };
  const n = await env.DB.prepare("SELECT COUNT(*) AS n FROM track_guardians WHERE parent_id = ?").bind(me.id).first();
  if (n.n >= 12) return { error: "too many", status: 429 };
  const email = `child-${[...randomBytes(6)].map((x) => x.toString(16).padStart(2, "0")).join("")}@${CHILD_DOMAIN}`;
  const lic = String(f.licence || "").replace(/\s+/g, "").slice(0, 12);
  const lang = ["fr", "en", "de", "es"].includes(f.lang) ? f.lang : ["fr", "en", "de", "es"].includes(me.lang) ? me.lang : "fr";
  const row = await env.DB.prepare(`INSERT INTO users (email, pw_hash, pw_salt, pw_iter, first_name, last_name, licence, display_name,
    consent_at, created_at, lang, email_verified, status) VALUES (?, '', '', 0, ?, ?, ?, ?, ?, ?, ?, 1, 'active') RETURNING *`)
    .bind(email, first, last, lic, `${first} ${last}`.trim(), nowIso(), nowIso(), lang).first();
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET child = 1, birth_year = ?, modules_checked = 1 WHERE id = ?").bind(by, row.id),
    env.DB.prepare("INSERT INTO track_guardians (child_id, parent_id, created_at) VALUES (?, ?, ?)").bind(row.id, me.id, nowIso()),
  ]);
  return { ok: true, child: { ...row, child: 1, birth_year: by } };
}

/** A child account and everything tied to it deleted (its parent deletes it, or the last guardian's account goes). */
export async function deleteChild(env, id) {
  await deleteAllRuns(env, id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM track_guardians WHERE child_id = ?").bind(id),
    env.DB.prepare("DELETE FROM track_watchers WHERE user_id = ? OR watcher_id = ?").bind(id, id),
    env.DB.prepare("UPDATE track_devices SET revoked_at = ?, user_id = NULL, push_token = NULL WHERE user_id = ?").bind(nowIso(), id),
    env.DB.prepare("DELETE FROM track_runs WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM track_settings WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM track_codes WHERE user_id = ?").bind(id),
    env.DB.prepare("DELETE FROM users WHERE id = ? AND child = 1").bind(id),
  ]);
  for (const q of ["DELETE FROM usage_daily WHERE user_id = ?", "DELETE FROM push_subs WHERE user_id = ?", "DELETE FROM user_countries WHERE user_id = ?"]) {
    try { await env.DB.prepare(q).bind(id).run(); } catch (e) { /* a table of a later migration */ }
  }
}
