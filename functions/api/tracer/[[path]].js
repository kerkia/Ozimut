// /api/tracer — the course-setting events of « Organisation › Tracer », kept in R2 (bucket cn-state, binding BUCKET):
//   tracer-meta/<id>.json        the event's card: title, date, race, owner, team, encryption check (its summary also in
//                                the object's custom metadata, so the list is one R2 list)
//   tracer/<id>/event            the event itself (JSON, or ciphertext when the team encrypts it in the browser)
//   tracer/<id>/map              the map file as it came (PDF or image), never re-encoded
//   tracer/<id>/maps/<n>         the event's other maps (the advanced level: a course part on each), as they came
//   tracer/<id>/dem              the event's elevation model (tracer/relief.js; GET the team, PUT and DELETE those who edit)
//   tracer/<id>/v/<n>            saved versions (each with its author, time and note in the object's metadata)
//   tracer/<id>/comments         the team's comments (JSON or ciphertext)
//   tracer/<id>/field            the field statuses of the controls (set, checked, collected)
//   tracer/<id>/photo/<pid>      the field mode's photos of the controls
//   tracer/<id>/lock             who is editing (refreshed every minute; others open the event read-only)
// Courses are secret until the race (owner, 2026-10-15): only the event's team opens it — its creator and the people who
// joined it by an invitation link (owner, 2026-10-20: for everyone, FFCO licensees included; nobody is looked up by name,
// licence or e-mail): the owner or a setter makes a link for a role and passes it on as they like; whoever opens it signed
// in joins under their own account's name (a member { uid, lic?, name, role }; members added by licence before keep their
// place). « setter » edits, « controller » edits and comments, « viewer » reads and comments; not the
// administrators. A competition's event is created by a member of the race's organising club (_lib/club.js); a
// training event by any account. With encryption, the server never sees the courses: it stores bytes.
//
//   GET    /api/tracer                       one's events, one's club
//   POST   /api/tracer                       { kind: "race"|"training", title, date, race? (a<agenda id> or a race of
//                                            « Résultats ») } -> { id }
//   GET    /api/tracer/<id>                  the card and one's role
//   PUT    /api/tracer/<id>                  setters: { title?, date?, team?, encrypted?, mapPrivate? }
//                                            (mapPrivate, owner 2026-11-06: the map marked « Carte privée », left out of the
//                                            administrators' collection, _lib/maplib.js; also at the creation)
//   DELETE /api/tracer/<id>                  the owner: everything
//   GET|PUT /api/tracer/<id>/event           PUT: X-Base-Version (the version edited; 409 if another was saved since)
//   GET|PUT /api/tracer/<id>/map             PUT: the file (Content-Type, up to 80 MB)
//   GET|PUT|DELETE /api/tracer/<id>/maps/<n> another map of the event (n 1…20), as the map
//   GET    /api/tracer/<id>/versions         the list;  GET …/versions/<n> one;  POST …/versions (body, X-Note);
//                                            DELETE …/versions?below=<n> (the owner, after encrypting)
//   GET|PUT /api/tracer/<id>/comments, …/field
//   GET|PUT|DELETE /api/tracer/<id>/photo/<pid>   a control's photo (field mode; editors put and delete)
//   POST|DELETE /api/tracer/<id>/lock        take (or refresh) / release the editing lock
//   GET    /api/tracer/<id>/invites          owners and setters: the links still valid (no token: only its hash is kept)
//   POST   /api/tracer/<id>/invites          { role, days?, lent? } -> { token, n, expires }: a new link (7 days by default, 30 at
//                                            most); lent: the map lent to whoever joins by it (no print or export of the map)
//   DELETE /api/tracer/<id>/invites?n=…      revoke one
//   POST   /api/tracer/<id>/join             { token } -> { role, joined }: any signed-in account (but a demo one) joins the team

import { allow, isAdmin, json, readBody, withUser, nowIso } from "../../_lib/api.js";
import { showModule } from "../../_lib/modules.js";
import { newToken, randomBytes, sha256hex } from "../../_lib/crypto.js";
import { clubOf, findRace, orgCode, organises } from "../../_lib/club.js";
import { isMember, ready as eventsReady, shortName } from "../../_lib/events.js";

const META = "tracer-meta/", DATA = "tracer/";
const MAX_MAP = 80 * 1024 * 1024, MAX_EVENT = 12 * 1024 * 1024, MAX_SMALL = 4 * 1024 * 1024, MAX_PHOTO = 4 * 1024 * 1024, MAX_VERSIONS = 120;
const MAX_DEM = 6 * 1024 * 1024;
const ROLES = ["setter", "controller", "viewer"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const newId = () => Array.from(randomBytes(12), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
const LOCK_MS = 150e3;

const summary = (m) => ({ id: m.id, kind: m.kind, title: m.title, date: m.date, race: m.race || "", event: m.event || "", orgClub: m.orgClub || "", owner: String(m.owner),
  ownerName: m.ownerName || "", team: m.team.filter((x) => x.lic).map((x) => x.lic).join(","),
  uids: m.team.filter((x) => x.uid).map((x) => x.uid).join(","), enc: m.encrypted ? "1" : "", priv: m.mapPrivate ? "1" : "", updated: m.updated || "", version: String(m.version || 0) });
async function loadMeta(env, id) {
  const o = await env.BUCKET.get(`${META}${id}.json`);
  if (!o) return null;
  try { return await o.json(); } catch (e) { return null; }
}
async function saveMeta(env, meta) {
  await env.BUCKET.put(`${META}${meta.id}.json`, JSON.stringify(meta), { httpMetadata: { contentType: "application/json" }, customMetadata: summary(meta) });
}
async function listAll(env, prefix, include = true) {
  const out = [];
  let cursor;
  do {
    const r = await env.BUCKET.list({ prefix, cursor, include: include ? ["customMetadata"] : undefined, limit: 1000 });
    out.push(...r.objects);
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}
/** One's role on an event: "owner", "setter", "controller", "viewer", or null. */
function roleOf(meta, user) {
  if (meta.owner === user.id) return "owner";
  const m = meta.team.find((x) => (x.uid && Number(x.uid) === user.id) || (x.lic && user.licence && String(x.lic) === String(user.licence)));
  return m ? m.role : null;
}
const canEdit = (r) => r === "owner" || r === "setter" || r === "controller";
const MAX_INVITES = 20, INVITE_DAYS = 7;
/** An event's invitation links: [{ n, h (sha-256 of the token), role, by, created, expires }], the expired ones dropped. */
async function loadInvites(env, base) {
  const o = await env.BUCKET.get(`${base}invites`);
  const list = o ? await o.json().catch(() => []) : [];
  return (Array.isArray(list) ? list : []).filter((x) => x.expires > Date.now());
}
const saveInvites = (env, base, list) => env.BUCKET.put(`${base}invites`, JSON.stringify(list), { httpMetadata: { contentType: "application/json" } });
function rawResponse(o, type = "application/octet-stream") {
  return new Response(o.body, { headers: { "Content-Type": o.httpMetadata?.contentType || type, "Cache-Control": "no-store",
    "X-Version": o.customMetadata?.version || "", "X-Updated": o.customMetadata?.updated || "", "X-Updated-By": o.customMetadata?.by || "" } });
}
async function putRaw(env, request, key, max, meta = {}) {
  const size = Number(request.headers.get("Content-Length") || 0);
  if (!size) return json({ error: "empty" }, 400);
  if (size > max) return json({ error: "too big" }, 413);
  const type = (request.headers.get("Content-Type") || "application/octet-stream").split(";")[0].trim();
  await env.BUCKET.put(key, request.body, { httpMetadata: { contentType: type }, customMetadata: meta });
  return null;
}

export const onRequest = withUser(async (ctx, user) => {
  const { request, env, params } = ctx;
  if (!env.BUCKET) return json({ error: "storage not configured" }, 500);
  const parts = [].concat(params.path || []).map(String).filter(Boolean);
  const method = request.method;
  let clubMemo;
  const lazyClub = async () => (clubMemo === undefined ? (clubMemo = await clubOf(env, request, user.licence)) : clubMemo);

  /** An event of Orga (functions/api/events) the account is on the team of (an administrator: any), or null. */
  const orgaEvent = async (eid) => {
    if (!/^[a-z0-9]{6,20}$/.test(String(eid || "")) || !(await eventsReady(env))) return null;
    const ev = await env.DB.prepare("SELECT * FROM events WHERE id = ? AND status = 'active'").bind(eid).first();
    return ev && (isAdmin(env, user) || (await isMember(env, ev.id, user.id))) ? ev : null;
  };

  if (!parts.length) {
    // the course setting of an event of Orga (« Orga », its « Tracé » tab; owner, 2026-11-12): to the event's team, which
    // course-setting events belong to it (by the event's id, or its competition), who set them and whether one may open them —
    // the courses stay the setting team's (a controller from another club, the setters; not the timekeeper or the booking desk)
    const forEvent = new URL(request.url).searchParams.get("event");
    if (method === "GET" && forEvent) {
      const ev = await orgaEvent(forEvent);
      if (!ev) return json({ error: "forbidden" }, 403);
      const out = [];
      for (const o of await listAll(env, META)) {
        const m = o.customMetadata || {};
        if (m.event !== ev.id && !(ev.race_key && m.race === ev.race_key)) continue;
        const member = Number(m.owner) === user.id || (!!user.licence && (m.team || "").split(",").includes(String(user.licence)))
          || (m.uids || "").split(",").includes(String(user.id));
        // the name as FFCO writes it, « SURNAME First »: the first name is its last word
        const words = String(m.ownerName || "").trim().split(/\s+/), first = words.pop() || "", rest = words;
        out.push({ id: m.id, kind: m.kind, title: m.title, date: m.date, member, encrypted: !!m.enc, updated: m.updated,
          by: shortName({ display_name: m.ownerName, first_name: first, last_name: rest.join(" ") }),
          team: (m.uids ? m.uids.split(",").length : 0) + 1 });
      }
      return json({ events: out });
    }
    if (method === "GET") {
      const out = [];
      for (const o of await listAll(env, META)) {
        const m = o.customMetadata || {};
        // (by licence or by account; no licence matches no team member: "".split gives [""])
        const mine = Number(m.owner) === user.id, member = (!!user.licence && (m.team || "").split(",").includes(String(user.licence)))
          || (m.uids || "").split(",").includes(String(user.id));
        if (!mine && !member) continue;
        out.push({ id: m.id, kind: m.kind, title: m.title, date: m.date, race: m.race, event: m.event || "", ownerName: m.ownerName, mine, encrypted: !!m.enc, updated: m.updated });
      }
      out.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.updated || "").localeCompare(a.updated || ""));
      const url = new URL(request.url);
      const stats = url.searchParams.get("stats") && isAdmin(env, user)
        ? { events: (await listAll(env, META, false)).length, bytes: (await listAll(env, DATA, false)).reduce((s, o) => s + o.size, 0) } : null;
      return json({ events: out, club: await lazyClub(), stats });
    }
    if (method === "POST") {
      const b = await readBody(request);
      if (!b) return json({ error: "bad request" }, 400);
      if (!(await allow(env, `trcreate:${user.id}`, 30, 86400))) return json({ error: "too many" }, 429);
      const kind = b.kind === "race" ? "race" : b.kind === "training" ? "training" : null;
      // made from an event of Orga (its « Tracé » tab): tied to it, by a member of its team
      const orga = b.event ? await orgaEvent(b.event) : null;
      if (b.event && !orga) return json({ error: "event" }, 403);
      const title = clean(b.title, 140), date = String(b.date || "");
      if (!kind || title.length < 3 || !DAY.test(date)) return json({ error: "fields" }, 400);
      let race = "", orgClub = "";
      if (kind === "race") {
        race = clean(b.race, 60);
        const r = race ? await findRace(env, request, race) : null;
        if (!r) return json({ error: "race" }, 400);
        orgClub = orgCode(r.org) || "";
        // a competition: by a member of its organising club, the account that declared it (or an administrator)
        if (!(await organises(env, request, user, r, await lazyClub()))) return json({ error: "not organiser" }, 403);
      }
      const meta = { id: newId(), kind, title, date, race, orgClub, ...(orga ? { event: orga.id } : {}), owner: user.id, ownerName: user.display_name || "", ownerLic: String(user.licence || ""),
        team: [], encrypted: null, mapPrivate: !!b.mapPrivate, created: nowIso(), updated: nowIso(), version: 0, map: null };
      await saveMeta(env, meta);
      await showModule(env, user.id, "orga");        // what the account starts here shows its module (_lib/modules.js, owner 2026-11-12)
      return json({ id: meta.id });
    }
    return json({ error: "method" }, 405);
  }

  const id = parts[0];
  if (!/^[a-z0-9]{8,16}$/.test(id)) return json({ error: "not found" }, 404);
  const meta = await loadMeta(env, id);
  if (!meta) return json({ error: "not found" }, 404);
  const role = roleOf(meta, user);
  const sub = parts[1] || "";
  const base = `${DATA}${id}/`;
  // an invitation link: whoever opens it signed in joins with the link's role (one already in the team keeps theirs)
  if (sub === "join" && method === "POST") {
    if (!(await allow(env, `trjoin:${user.id}`, 30, 3600))) return json({ error: "too many" }, 429);
    const b = await readBody(request);
    const h = b?.token ? await sha256hex(String(b.token).slice(0, 100)) : "";
    const inv = (await loadInvites(env, base)).find((x) => x.h === h);
    if (!inv) return json({ error: "invite" }, 410);
    if (role) return json({ ok: true, role, joined: false });
    meta.team.push({ uid: user.id, ...(user.licence ? { lic: String(user.licence) } : {}), name: user.display_name || "", role: inv.role,
      ...(inv.lent ? { lent: true } : {}), joined: nowIso() });
    meta.updated = nowIso();
    await saveMeta(env, meta);
    await showModule(env, user.id, "orga");          // invited to set courses: Orga shows (_lib/modules.js)
    return json({ ok: true, role: inv.role, joined: true });
  }
  if (!role) return json({ error: "forbidden" }, 403);

  if (!sub) {
    if (method === "GET") {
      const lock = await env.BUCKET.get(`${base}lock`).then((o) => (o ? o.json() : null)).catch(() => null);
      const held = lock && lock.until > Date.now() && lock.uid !== user.id ? lock : null;
      // lent: the map lent to this member (the team's choice: set courses on it, neither print nor export it — the editor refuses)
      const me = meta.team.find((x) => (x.uid && Number(x.uid) === user.id) || (x.lic && user.licence && String(x.lic) === String(user.licence)));
      return json({ event: meta, role, lent: role !== "owner" && !!me?.lent, you: { uid: user.id, lic: String(user.licence || ""), name: user.display_name || "" }, lock: held });
    }
    if (method === "PUT") {
      if (role !== "owner" && role !== "setter") return json({ error: "forbidden" }, 403);
      const b = await readBody(request);
      if (!b) return json({ error: "bad request" }, 400);
      if (b.title != null) { const t = clean(b.title, 140); if (t.length < 3) return json({ error: "fields" }, 400); meta.title = t; }
      if (b.date != null) { if (!DAY.test(String(b.date))) return json({ error: "fields" }, 400); meta.date = String(b.date); }
      if (b.team != null) {
        // the members already in the team, their role changed or left out (removed); nobody added here: by invitation alone
        if (!Array.isArray(b.team) || b.team.length > 60) return json({ error: "team" }, 400);
        const same = (x, y) => (x.uid != null && y.uid != null ? Number(x.uid) === Number(y.uid) : !!x.lic && String(x.lic) === String(y.lic || ""));
        meta.team = meta.team.flatMap((m) => {
          const x = b.team.find((y) => y && same(m, y));
          if (!x) return [];
          const out = { ...m, role: ROLES.includes(x.role) ? x.role : m.role };
          if (x.lent !== undefined) { if (x.lent) out.lent = true; else delete out.lent; }
          return [out];
        });
      }
      if (b.encrypted !== undefined) {
        // the team's passphrase check (salt, iterations, an encrypted known text), set when the event's data is
        // re-encrypted by the browser; null when decrypted again
        const e = b.encrypted;
        meta.encrypted = e && typeof e.salt === "string" && typeof e.check === "string" && e.salt.length < 100 && e.check.length < 400
          ? { salt: e.salt, check: e.check, iter: Number(e.iter) || 250000 } : null;
      }
      if (b.mapPrivate !== undefined) meta.mapPrivate = !!b.mapPrivate;
      // tied to an event of Orga, or no longer (its owner or a setter, a member of that event's team)
      if (b.event !== undefined) {
        if (b.event) { const orga = await orgaEvent(b.event); if (!orga) return json({ error: "event" }, 403); meta.event = orga.id; }
        else delete meta.event;
      }
      if (b.map !== undefined) meta.map = b.map ? { name: clean(b.map.name, 200), type: clean(b.map.type, 60), size: Number(b.map.size) || 0 } : null;
      if (b.published !== undefined) meta.published = b.published ? { analysis: clean(b.published.analysis, 20),
        analyses: (Array.isArray(b.published.analyses) ? b.published.analyses : []).slice(-20).map((x) => clean(x, 20)).filter(Boolean), at: nowIso() } : null;
      meta.updated = nowIso();
      await saveMeta(env, meta);
      return json({ ok: true, event: meta });
    }
    if (method === "DELETE") {
      if (role !== "owner") return json({ error: "forbidden" }, 403);
      const keys = (await listAll(env, base, false)).map((o) => o.key);
      for (let i = 0; i < keys.length; i += 1000) await env.BUCKET.delete(keys.slice(i, i + 1000));
      await env.BUCKET.delete(`${META}${id}.json`);
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "invites") {
    if (role !== "owner" && role !== "setter") return json({ error: "forbidden" }, 403);
    const list = await loadInvites(env, base);
    const shown = (x) => ({ n: x.n, role: x.role, lent: !!x.lent, by: x.byName || "", created: x.created, expires: x.expires });
    if (method === "GET") return json({ invites: list.map(shown) });
    if (method === "POST") {
      const b = await readBody(request);
      if (!b || !ROLES.includes(b.role)) return json({ error: "bad request" }, 400);
      if (!(await allow(env, `trinvite:${user.id}`, 40, 86400))) return json({ error: "too many" }, 429);
      if (list.length >= MAX_INVITES) return json({ error: "too many invites" }, 409);
      const token = newToken(), days = Math.min(30, Math.max(1, Number(b.days) || INVITE_DAYS));
      const x = { n: Math.max(0, ...list.map((y) => y.n)) + 1, h: await sha256hex(token), role: b.role, ...(b.lent ? { lent: true } : {}), by: user.id,
        byName: user.display_name || "", created: Date.now(), expires: Date.now() + days * 864e5 };
      await saveInvites(env, base, [...list, x]);
      return json({ token, ...shown(x) });
    }
    if (method === "DELETE") {
      const n = Number(new URL(request.url).searchParams.get("n"));
      await saveInvites(env, base, list.filter((x) => x.n !== n));
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "event") {
    if (method === "GET") {
      const o = await env.BUCKET.get(`${base}event`);
      return o ? rawResponse(o, "application/json") : json({ error: "empty" }, 404);
    }
    if (method === "PUT") {
      if (!canEdit(role)) return json({ error: "forbidden" }, 403);
      if (!(await allow(env, `trsave:${user.id}`, 2000, 86400))) return json({ error: "too many" }, 429);
      const baseVersion = Number(request.headers.get("X-Base-Version") ?? -1);
      if (baseVersion >= 0 && baseVersion !== (meta.version || 0)) return json({ error: "conflict", version: meta.version, by: meta.updatedBy || "", at: meta.updated }, 409);
      const version = (meta.version || 0) + 1;
      const err = await putRaw(env, request, `${base}event`, MAX_EVENT, { version: String(version), updated: nowIso(), by: user.display_name || "" });
      if (err) return err;
      meta.version = version; meta.updated = nowIso(); meta.updatedBy = user.display_name || "";
      await saveMeta(env, meta);
      return json({ ok: true, version });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "map") {
    if (method === "GET") {
      const o = await env.BUCKET.get(`${base}map`);
      if (!o) return json({ error: "not found" }, 404);
      return new Response(o.body, { headers: { "Content-Type": o.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "private, max-age=600" } });
    }
    if (method === "PUT") {
      if (role !== "owner" && role !== "setter") return json({ error: "forbidden" }, 403);
      if (!(await allow(env, `trmap:${user.id}`, 60, 86400))) return json({ error: "too many" }, 429);
      const err = await putRaw(env, request, `${base}map`, MAX_MAP, { updated: nowIso() });
      return err || json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  // the event's other maps (the advanced level: several maps in one event, a course part on each): tracer/<id>/maps/<n>, n 1…20
  if (sub === "maps") {
    const n = Number(parts[2]);
    if (!(Number.isInteger(n) && n >= 1 && n <= 20)) return json({ error: "map number" }, 400);
    const key = `${base}maps/${n}`;
    if (method === "GET") {
      const o = await env.BUCKET.get(key);
      if (!o) return json({ error: "not found" }, 404);
      return new Response(o.body, { headers: { "Content-Type": o.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "private, max-age=600" } });
    }
    if (method === "PUT") {
      if (role !== "owner" && role !== "setter") return json({ error: "forbidden" }, 403);
      if (!(await allow(env, `trmap:${user.id}`, 60, 86400))) return json({ error: "too many" }, 429);
      const err = await putRaw(env, request, key, MAX_MAP, { updated: nowIso() });
      return err || json({ ok: true });
    }
    if (method === "DELETE") {
      if (role !== "owner" && role !== "setter") return json({ error: "forbidden" }, 403);
      await env.BUCKET.delete(key);
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  // the event's elevation model (tracer/relief.js: the heights over the map, kept so that the whole team has the same figures)
  if (sub === "dem") {
    const key = `${base}dem`;
    if (method === "GET") {
      const o = await env.BUCKET.get(key);
      if (!o) return json({ error: "not found" }, 404);
      return new Response(o.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store" } });
    }
    if (!canEdit(role)) return json({ error: "forbidden" }, 403);
    if (method === "PUT") {
      if (!(await allow(env, `trdem:${user.id}`, 60, 86400))) return json({ error: "too many" }, 429);
      const err = await putRaw(env, request, key, MAX_DEM, { updated: nowIso() });
      return err || json({ ok: true });
    }
    if (method === "DELETE") { await env.BUCKET.delete(key); return json({ ok: true }); }
    return json({ error: "method" }, 405);
  }

  if (sub === "versions") {
    const n = parts[2];
    if (method === "GET" && n == null) {
      const list = (await listAll(env, `${base}v/`)).map((o) => ({ n: Number(o.key.slice(`${base}v/`.length)), size: o.size, at: o.customMetadata?.at || "",
        by: o.customMetadata?.by || "", note: o.customMetadata?.note || "", summary: o.customMetadata?.summary || "" })).sort((a, b) => b.n - a.n);
      return json({ versions: list });
    }
    if (method === "GET") {
      const o = /^\d+$/.test(n) ? await env.BUCKET.get(`${base}v/${n}`) : null;
      return o ? rawResponse(o, "application/json") : json({ error: "not found" }, 404);
    }
    if (method === "DELETE") {
      // the owner removes the versions saved before a number (those written in clear, once the event is encrypted)
      if (role !== "owner") return json({ error: "forbidden" }, 403);
      const below = Number(new URL(request.url).searchParams.get("below") || 0);
      const keys = (await listAll(env, `${base}v/`, false)).map((o) => o.key).filter((k) => Number(k.slice(`${base}v/`.length)) < below);
      for (let i = 0; i < keys.length; i += 1000) await env.BUCKET.delete(keys.slice(i, i + 1000));
      return json({ ok: true, removed: keys.length });
    }
    if (method === "POST") {
      if (!canEdit(role)) return json({ error: "forbidden" }, 403);
      if (!(await allow(env, `trversion:${user.id}`, 300, 86400))) return json({ error: "too many" }, 429);
      const list = (await listAll(env, `${base}v/`, false)).map((o) => Number(o.key.slice(`${base}v/`.length))).sort((a, b) => a - b);
      const next = (list[list.length - 1] || 0) + 1;
      const note = decodeURIComponent(request.headers.get("X-Note") || "").slice(0, 300), sum = decodeURIComponent(request.headers.get("X-Summary") || "").slice(0, 800);
      const err = await putRaw(env, request, `${base}v/${next}`, MAX_EVENT, { at: nowIso(), by: user.display_name || "", note, summary: sum });
      if (err) return err;
      if (list.length + 1 > MAX_VERSIONS) await env.BUCKET.delete(list.slice(0, list.length + 1 - MAX_VERSIONS).map((k) => `${base}v/${k}`));
      return json({ ok: true, n: next });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "comments" || sub === "field") {
    if (method === "GET") {
      const o = await env.BUCKET.get(`${base}${sub}`);
      return o ? rawResponse(o, "application/json") : json({ empty: true });
    }
    if (method === "PUT") {
      // comments: every team member; field statuses: those who may edit
      if (sub === "field" && !canEdit(role)) return json({ error: "forbidden" }, 403);
      if (!(await allow(env, `tr${sub}:${user.id}`, 1000, 86400))) return json({ error: "too many" }, 429);
      const err = await putRaw(env, request, `${base}${sub}`, MAX_SMALL, { updated: nowIso(), by: user.display_name || "" });
      return err || json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "photo") {
    // the field mode's photos of a control (JPEG, or ciphertext when the event is encrypted): tracer/<id>/photo/<pid>
    const pid = String(parts[2] || "");
    if (!/^[a-z0-9-]{6,48}$/.test(pid)) return json({ error: "photo" }, 400);
    if (method === "GET") {
      const o = await env.BUCKET.get(`${base}photo/${pid}`);
      return o ? rawResponse(o, "image/jpeg") : json({ error: "not found" }, 404);
    }
    if (!canEdit(role)) return json({ error: "forbidden" }, 403);
    if (method === "PUT") {
      if (!(await allow(env, `trphoto:${user.id}`, 400, 86400))) return json({ error: "too many" }, 429);
      const err = await putRaw(env, request, `${base}photo/${pid}`, MAX_PHOTO, { updated: nowIso(), by: user.display_name || "" });
      return err || json({ ok: true });
    }
    if (method === "DELETE") { await env.BUCKET.delete(`${base}photo/${pid}`); return json({ ok: true }); }
    return json({ error: "method" }, 405);
  }

  if (sub === "lock") {
    if (!canEdit(role)) return json({ error: "forbidden" }, 403);
    const cur = await env.BUCKET.get(`${base}lock`).then((o) => (o ? o.json() : null)).catch(() => null);
    const held = cur && cur.until > Date.now() && cur.uid !== user.id;
    if (method === "POST") {
      const b = await readBody(request);
      if (held && !b?.force) return json({ ok: false, holder: cur });
      await env.BUCKET.put(`${base}lock`, JSON.stringify({ uid: user.id, name: user.display_name || "", until: Date.now() + LOCK_MS }), { httpMetadata: { contentType: "application/json" } });
      return json({ ok: true, took: held ? cur : null });
    }
    if (method === "DELETE") {
      if (cur && cur.uid === user.id) await env.BUCKET.delete(`${base}lock`);
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }
  return json({ error: "not found" }, 404);
});
