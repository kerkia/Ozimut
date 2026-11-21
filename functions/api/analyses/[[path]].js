// /api/analyses — the shared analyses (« Analyse club », « Analyse compétition »): an organiser's circuits (maps,
// georeferences, controls) and the runners' own GPS traces, kept in R2 (bucket cn-state, binding BUCKET):
//   analyses-meta/<id>.json                — the analysis (its summary also in the object's custom metadata: one list)
//   analyses/<id>/map-<n>                  — a circuit's map image
//   analyses/<id>/thumb-<n>                — its thumbnail (~480 px, the course drawn; made by the organiser's browser), for
//                                            « Analyse de carte »'s list (owner, 2026-11-04)
//   analyses/<id>/layers-<n>               — the route choices' layers of a circuit printed from an OCAD or Mapper map (its
//                                            symbols drawn on the circuit image's pixels by the organiser's browser, the map file
//                                            itself never sent; trace/vectorroutes.js packLayers; owner, 2026-11-05)
//   analyses/<id>/src-<i>                  — the OCAD / Mapper files of the circuits' import (the courses file, its map), kept
//                                            for the event's course setting, the organisers' alone (owner, 2026-11-12)
//   analyses/<id>/trace-<n>-<uid>.json     — one account's trace on circuit n: positions and times only, cropped to
//                                            the map by the browser; the name and licence are the account's
//   analyses/<id>/view-<uid>.json          — an account opened the analysis (not its organisers): its first and last day and
//                                            the days seen, in the object's custom metadata (owner, 2026-11-04: what the
//                                            organiser decides on — viewers against runners); empty body
//   analyses/<id>/solo-<n>-<uid>.json      — an account replayed circuit n alone in « Analyse solo » on the organiser's map
//   analyses/<id>/gview-<YYYY-MM-DD>.json  — visitors without an account who opened it that day (a count, approximate)
// The organisers see counts only (GET …/stats), never who. A draft (`draft`, every new analysis since 2026-11-04) is seen by
// its organisers alone until they publish it; `opts` are the runners' features the organisers switch (OPTS below).
// Organisers (2026-10-15): a training analysis (kind "club") is its creator's; a competition's (kind "race", one per
// race) is created and managed by the members of the race's organising club (_lib/club.js) and the administrators.
// Access: the organisers and the administrators always; otherwise by the analysis's rule — every logged-in account
// ("public"), the members of the organiser's club ("club": the club of one's latest race in the site's data), or a
// password ("password": checked once by /unlock, which returns a key — an HMAC of the analysis, the account and the
// password's salt — sent back in X-Analysis-Key). Each account adds, replaces or removes only its own trace; the
// organiser and the administrators may remove any.
// A club's analysis may also have a code (owner, 2026-11-07: a club's trainings have invitees from other clubs or from
// none): `code` true, the code kept as `pw` and given to /unlock as a password's. Every account lists the club's analyses;
// a non-member is told it is the club's (error "club", with `code`, the club and the organiser's name to ask).
//
//   GET    /api/analyses?kind=club|race[&race=<key>]   the analyses one may open, unlock or ask the club's organiser about
//   POST   /api/analyses                               create { kind, title, date, race?, vis, password?, code?, via? } -> { id }
//                                                      (`via`: where it was opened — "list" Orga's list, "form" a new training,
//                                                      "tracer" the Tracer's publication; kept since 2026-11-04 with `created`)
//   GET    /api/analyses/<id>                          the analysis and its traces' list
//   PUT    /api/analyses/<id>                          the organiser: { title?, vis?, password?, code?, courses?, draft?, openAt?, opts? }
//   GET    /api/analyses/<id>/stats                    the organiser: views, traces, solo replays, per circuit
//   POST   /api/analyses/<id>/solo/<n>                 an account replays circuit n in « Analyse solo » (counted)
//   DELETE /api/analyses/<id>                          the organiser: the analysis, its maps and traces
//   POST   /api/analyses/<id>/unlock                   { password } -> { key }
//   GET|PUT /api/analyses/<id>/map/<n>                 a circuit's map (PUT: the organiser, an image body)
//   GET|PUT /api/analyses/<id>/thumb/<n>               its thumbnail (PUT: the organiser, an image of 400 KB at most)
//   GET|PUT /api/analyses/<id>/layers/<n>              its route choices' layers (PUT: the organiser, 30 MB at most); the circuit
//                                                      says `layers: { map }`, the map's version they were drawn on
//   GET    /api/analyses/<id>/traces/<n>               every trace of circuit n, one JSON array
//   GET    /api/analyses/<id>/source[/<i>]            the organisers: the OCAD or Mapper files the circuits were imported from
//   PUT    /api/analyses/<id>/source/<i>?name=<file>   (`src-<i>`, kept when the organiser leaves « Les rendre disponibles pour le
//   DELETE /api/analyses/<id>/source                   tracé » ticked; owner, 2026-11-12: the event's course setting starts from
//                                                      them, no second upload). Never the runners', never the visitors'.
//   PATCH  /api/analyses/<id>/trace/<n>                one's own trace's comment and visitors' consent: { note?, visitors? }
//   GET    /api/analyses/v[/<id>[/map/<n> | /traces/<n>]]   visitors without an account (owner, 2026-11-02, after RouteGadget):
//                                                      the analyses an organiser opened to them (public, `visitors`), each
//                                                      only with the traces whose runners agreed (`visitors`), no licence;
//                                                      the list names every published event (2026-11-21), `access` saying
//                                                      which a visitor may open ("open") and why not ("account", "club", "locked")
//   PUT|DELETE /api/analyses/<id>/trace/<n>[/<uid>]    one's own trace (DELETE <uid>: the organiser, an admin); an admin's
//                                                      PUT { test: k } adds a test runner « <name> #k », DELETE …/tests
//                                                      removes that admin's test traces of circuit n
//   PUT    /api/analyses/<id>/extras/<n>               the organiser: what circuit n's runners share besides its map and
//                                                      controls — { variants } the route choices grouped by leg (each
//                                                      runner's own edits stay on their device), { exercises } a
//                                                      training's corridors and compass legs

import { allow, isAdmin, json, readBody, withUser, nowIso } from "../../_lib/api.js";
import { showModule } from "../../_lib/modules.js";
import { hashPassword, checkPassword, b64url, randomBytes } from "../../_lib/crypto.js";
import { clubOf, clubLabel, findRace, orgCode, organises } from "../../_lib/club.js";
import { scoreEvent, strict, teamIndex, withScore } from "../../_lib/events.js";

const META = "analyses-meta/";
const DATA = "analyses/";
const KINDS = ["club", "race"];
const VIS = ["public", "club", "password"];
const MAX_THUMB = 400 * 1024, MAX_LAYERS = 30 * 1024 * 1024;
const MAX_MAP = 80 * 1024 * 1024, MAX_TRACE = 3 * 1024 * 1024, MAX_POINTS = 40000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
// an administrator's test traces (several « runners » from one account, to try the replay): uid 1e9 + account × 1000 + k
const TEST_BASE = 1e9, TEST_MAX = 999;
const testUid = (account, k) => TEST_BASE + account * 1000 + k;
const testOwner = (uid) => (uid > TEST_BASE ? Math.floor((uid - TEST_BASE) / 1000) : null);
// the runners' features an organiser switches (owner, 2026-11-04), and their defaults: replaying alone on the organiser's map,
// adding one's trace, saving one's run in « Mes cartes », comments, the route choices, the 3D view, a headcam video, the
// computed routes (every account's and on by default since the same evening, owner: « enable computed routes for all, on by default »;
// the administrators always see them). `rv` marks a record whose `routes` was set after that: before it every switch saved wrote
// the old default (off), which is not the organiser's choice
const OPTS = { solo: true, upload: true, mymaps: true, export: true, notes: true, variants: true, view3d: true, video: true, routes: true };
const optsOf = (m) => Object.fromEntries(Object.entries(OPTS).map(([k, d]) => [k,
  typeof m?.opts?.[k] === "boolean" && (k !== "routes" || m.opts.rv) ? m.opts[k] : d]));
const parisDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
const newId = () => Array.from(randomBytes(12), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");

async function hmacKey(env) {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(`an:${env.SESSION_SECRET}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}
async function unlockKey(env, meta, uid) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), new TextEncoder().encode(`${meta.id}:${uid}:${meta.pw?.pw_salt || ""}`));
  return b64url(sig);
}

const VIA = ["list", "form", "tracer"];
// the trainings whose club's name was looked for in this isolate (the list, below); a club stored as its number alone
// (« 7707IF », before 2026-11-05)
const named = new Set(), BARE = /^\d{4}[A-Z]{0,2}$/;
// `cc` the event's country (a competition's, else its creator's site country), `orgName` its organising club as written
// (« 0109 - O'BUGEY »), `up` whether the runners may add their trace: « Analyse de carte »'s filters and actions (2026-11-04)
const hasCode = (m) => m.vis === "club" && !!m.code && !!m.pw;
// a draft may be given its opening (owner, 2026-11-16: « Enregistrer et publier plus tard »): `openAt`, an ISO time; it stays a
// draft until then and is published by itself at that time, whatever reads it (the analysis, or its summary in a list)
const draftNow = (draft, openAt) => !!draft && draft !== "0" && !(openAt && Date.now() >= Date.parse(openAt));
const isDraft = (m) => draftNow(m.draft, m.openAt);
const summary = (m) => ({ id: m.id, kind: m.kind, title: m.title, date: m.date, race: m.race || "", club: m.club || "", orgClub: m.orgClub || "", vis: m.vis,
  code: hasCode(m) ? "1" : "",
  created: m.created || "", via: m.via || "", cc: m.cc || "", orgName: m.orgName || "", orgSet: m.orgSet ? "1" : "", up: optsOf(m).upload ? "1" : "0",
  visitors: m.visitors && m.vis === "public" ? "1" : "", draft: m.draft ? "1" : "", openAt: m.draft && m.openAt ? m.openAt : "", solo: optsOf(m).solo ? "1" : "0",
  owner: m.owner, ownerName: m.ownerName || "", courses: (m.courses || []).length, updated: m.updated, pos: centreOf(m) });
/** The middle of the first circuit's map, "lat,lon" (« Analyse de carte » places the event on its map), or "". */
function centreOf(m) {
  const c = (m.courses || [])[0], g = c?.geo;
  if (!g || !c.map?.w || !c.map?.h) return "";
  const det = g.a * g.e - g.b * g.d;
  if (!det) return "";
  const x = c.map.w / 2 - g.c, y = c.map.h / 2 - g.f;
  const lon = (g.e * x - g.b * y) / det, lat = (-g.d * x + g.a * y) / det;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? `${lat.toFixed(5)},${lon.toFixed(5)}` : "";
}
const custom = (m) => Object.fromEntries(Object.entries(summary(m)).map(([k, v]) => [k, String(v ?? "")]));
const publicMeta = (m) => { const { pw, ...rest } = m; return { ...rest, code: hasCode(m), draft: isDraft(m), openAt: isDraft(m) ? m.openAt || null : null, opts: optsOf(m) }; };

async function loadMeta(env, id) {
  const o = await env.BUCKET.get(`${META}${id}.json`);
  if (!o) return null;
  try { return await o.json(); } catch (e) { return null; }
}
async function saveMeta(env, meta) {
  meta.updated = nowIso();
  await env.BUCKET.put(`${META}${meta.id}.json`, JSON.stringify(meta), { httpMetadata: { contentType: "application/json" }, customMetadata: custom(meta) });
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

/** Per analysis, from one listing of its data: the runners who shared a trace (`visible`: those visitors may see) and the
 *  circuits with a thumbnail. */
async function dataCounts(env) {
  const by = new Map(), of = (id) => (by.has(id) ? by.get(id) : by.set(id, { runners: new Set(), visible: new Set(), thumbs: [] }).get(id));
  for (const o of await listAll(env, DATA)) {
    const x = /^analyses\/([a-z0-9-]+)\/(trace|thumb)-(\d+)(?:-(\d+)\.json)?$/.exec(o.key);
    if (!x) continue;
    const c = of(x[1]);
    if (x[2] === "thumb") c.thumbs.push(Number(x[3]));
    else if (x[4] && o.customMetadata?.test !== "1") { c.runners.add(x[4]); if (o.customMetadata?.vis === "1") c.visible.add(x[4]); }
  }
  return (id) => by.get(id) || { runners: new Set(), visible: new Set(), thumbs: [] };
}
const firstThumb = (c) => (c.thumbs.length ? Math.min(...c.thumbs) : null);

/** "open", "locked" (a password to give), "club" (its club's, with or without a code for invitees) or null (not for this
 *  account). */
async function access(ctx, user, meta, lazyClub) {
  const { env, request } = ctx;
  if (await isOrganiser(env, user, meta, lazyClub)) return "open";
  if (meta.vis === "public") return "open";
  const keyOk = async () => { const k = request.headers.get("X-Analysis-Key"); return !!k && k === await unlockKey(env, meta, user.id); };
  if (meta.vis === "club") {
    if (meta.club && (await lazyClub()) === meta.club) return "open";
    return hasCode(meta) && (await keyOk()) ? "open" : "club";
  }
  if (meta.vis === "password") return (await keyOk()) ? "open" : "locked";
  return null;
}
/**
 * The analysis's organisers: the administrators; when an event of « Orga › Gérer » holds it (its competition, or its id for a
 * training) the event's team alone (functions/_lib/events.js); else its creator, and for a competition — unless
 * EVENTS_STRICT — the organising club's members, as before the events.
 */
async function isOrganiser(env, user, meta, lazyClub) {
  if (isAdmin(env, user)) return true;
  const idx = await lazyTeams();
  if (idx) {
    for (const k of [meta.id, meta.kind === "race" ? meta.race : null]) if (k && idx.held.has(k)) return idx.mine.has(k);
  }
  if (meta.owner === user.id) return true;
  return !!idx && strict(env) ? false : meta.kind === "race" && !!meta.orgClub && (await lazyClub()) === meta.orgClub;
  // (lazyTeams: the account's teams, read once a request — set by the handler below)
  async function lazyTeams() { return TEAMS.get(user.id) ?? (TEAMS.set(user.id, await teamIndex(env, user)), TEAMS.get(user.id)); }
}
// the teams read in this request (a fresh map every request: the handler clears it)
const TEAMS = new Map();

/** A circuit's layers' record: the map version they were drawn on (the layers of another map are not this map's). */
function cleanLayers(c) {
  const v = Math.round(num(c.layers?.map) || 0);
  return v && v === Math.round(num(c.map?.v) || 0) ? { layers: { map: v, src: clean(c.layers.src, 10) } } : {};
}
function cleanCourses(list) {
  if (!Array.isArray(list) || list.length > 12) return null;
  const out = [];
  for (const c of list) {
    const n = Number(c?.n);
    if (!Number.isInteger(n) || n < 0 || n > 99 || out.some((x) => x.n === n)) return null;
    const g = c.geo || {};
    const geo = Object.fromEntries(["a", "b", "c", "d", "e", "f"].map((k) => [k, num(g[k])]));
    if (Object.values(geo).some((v) => v == null)) return null;
    const ctrls = Array.isArray(c.controls) ? c.controls.slice(0, 80).map((p) => ({
      kind: ["start", "control", "finish"].includes(p?.kind) ? p.kind : "control", code: clean(p?.code, 10), x: num(p?.x), y: num(p?.y) })) : [];
    if (ctrls.some((p) => p.x == null || p.y == null)) return null;
    const m = c.map || {};
    out.push({ n, name: clean(c.name, 60) || `Circuit ${n + 1}`, circuit: clean(c.circuit, 80), r: num(c.r) || 20,
      map: { w: Math.round(num(m.w) || 0), h: Math.round(num(m.h) || 0), type: /^image\/(png|jpeg|webp)$/.test(m.type) ? m.type : "image/jpeg", v: Math.round(num(m.v) || 0) },
      geo, controls: ctrls, ...(c.score === true ? { score: true } : {}), ...(typeof c.printed === "boolean" ? { printed: c.printed } : {}),
      ...cleanLayers(c), ...cleanExtras(c) });
  }
  return out;
}

const KEY = /^[A-Z]{1,2}$/;
/** The route choices of a circuit, by leg: { "<leg>": { th, names: { key: name }, assign: { uid: key } } } (or null). */
function cleanVariants(v) {
  if (v == null) return {};
  if (typeof v !== "object" || Array.isArray(v)) return null;
  const out = {};
  for (const [leg, x] of Object.entries(v).slice(0, 80)) {
    if (!/^\d{1,2}$/.test(leg) || !x || typeof x !== "object") return null;
    const e = {};
    if (x.th != null) { const th = num(x.th); if (th == null || th < 5 || th > 1000) return null; e.th = Math.round(th); }
    if (x.names != null) e.names = Object.fromEntries(Object.entries(x.names).slice(0, 60).filter(([k]) => KEY.test(k)).map(([k, n]) => [k, clean(n, 40)]).filter(([, n]) => n));
    if (x.assign != null) e.assign = Object.fromEntries(Object.entries(x.assign).slice(0, 1000).filter(([u, k]) => /^\d{1,12}$/.test(u) && KEY.test(String(k))));
    out[leg] = e;
  }
  return out;
}
/** A training's exercises: [{ id, kind: "corridor" | "compass", leg (0: the whole course), w (m), name, pts? (px) }] (or null). */
function cleanExercises(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 20) return null;
  const out = [];
  for (const e of list) {
    const id = String(e?.id || ""), kind = e?.kind, leg = Number(e?.leg ?? 0), w = num(e?.w);
    if (!/^[a-z0-9]{1,12}$/.test(id) || !["corridor", "compass"].includes(kind) || !Number.isInteger(leg) || leg < 0 || leg > 99 || w == null || w < 2 || w > 1000) return null;
    const x = { id, kind, leg, w: Math.round(w * 10) / 10, name: clean(e.name, 60) };
    if (kind === "corridor") {
      if (!Array.isArray(e.pts) || e.pts.length < 2 || e.pts.length > 300) return null;
      x.pts = e.pts.map((p) => [num(p?.[0]), num(p?.[1])]);
      if (x.pts.some(([a, b]) => a == null || b == null)) return null;
      x.pts = x.pts.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]);
    } else if (!leg) return null;
    out.push(x);
  }
  return out;
}
/** A circuit's shared extras, kept through the organiser's edits of its map and controls. */
function cleanExtras(c) {
  const out = {};
  const v = cleanVariants(c?.variants);
  if (v && Object.keys(v).length) out.variants = v;
  const x = cleanExercises(c?.exercises);
  if (x?.length) out.exercises = x;
  return out;
}

function cleanTrace(b) {
  if (!b || b.v !== 1 || !Number.isFinite(b.t0) || !Array.isArray(b.dt) || !Array.isArray(b.la) || !Array.isArray(b.lo)) return null;
  const n = b.dt.length;
  if (n < 10 || n > MAX_POINTS || b.la.length !== n || b.lo.length !== n) return null;
  const ints = (a) => a.every((v) => Number.isInteger(v) && Math.abs(v) < 400000000);
  if (!ints(b.dt) || !ints(b.la) || !ints(b.lo) || b.dt.some((v, i) => i && v <= 0)) return null;
  return { v: 1, t0: Math.round(b.t0), dt: b.dt, la: b.la, lo: b.lo };
}

/** A runner's comment on their race (owner, 2026-11-02, after RouteGadget): plain text, its lines kept. */
const cleanNote = (s) => String(s ?? "").replace(/\r/g, "").replace(/[\u0000-\u0009\u000b-\u001f<>]/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 1000);

// ---- visitors without an account (owner, 2026-11-02, after RouteGadget): read only, the analyses their organiser opened to
// them, the traces whose runners agreed, no licence; reached with the guest pass (_middleware.js GUEST)
async function visitors(ctx, parts) {
  const { request, env } = ctx;
  if (request.method !== "GET") return json({ error: "method" }, 405);
  const open = (m) => !!m && m.vis === "public" && !!m.visitors && !isDraft(m);
  if (!parts.length) {
    // every published event is listed (owner, 2026-11-21: « all users see all events, even those they cannot access »): one a
    // visitor cannot open says why — "account" (open to accounts), "club" (its club's), "locked" (a password) — and gives its
    // name, day, club, place and numbers only: no thumbnail, and never its organiser's name
    const metas = (await listAll(env, META)).map((o) => o.customMetadata || {}).filter((m) => VIS.includes(m.vis) && !draftNow(m.draft === "1", m.openAt));
    const counts = await dataCounts(env);
    return json({ analyses: metas.map((m) => {
      const open = m.vis === "public" && m.visitors === "1", c = counts(m.id);
      return { id: m.id, kind: m.kind, title: m.title, date: m.date, race: m.race, vis: m.vis, courses: Number(m.courses) || 0,
        pos: m.pos ? m.pos.split(",").map(Number) : null, access: open ? "open" : m.vis === "public" ? "account" : m.vis === "club" ? "club" : "locked",
        organiser: false, visitors: open, cc: m.cc || "", orgName: m.orgName || "", orgSet: m.orgSet === "1",
        runners: (open ? c.visible : c.runners).size, thumb: open ? firstThumb(c) : null, upload: false, solo: false };
    }) },
      200, { "Cache-Control": "private, max-age=60" });
  }
  const id = parts[0];
  if (!/^[a-z0-9-]{4,64}$/.test(id)) return json({ error: "not found" }, 404);
  const meta = await loadMeta(env, id);
  if (!open(meta)) return json({ error: "not found" }, 404);
  const n = parts[2] != null ? Number(parts[2]) : null;
  if (parts.length === 1) {
    const traces = (await listAll(env, `${DATA}${id}/trace-`)).filter((o) => o.customMetadata?.vis === "1").map((o) => {
      const m = o.customMetadata || {};
      return { course: Number(m.course), uid: Number(m.uid), name: m.name || "", lic: "", updated: m.updated || "", size: o.size };
    });
    // the page's check for new traces (owner, 2026-11-08): the list alone, no visit counted
    if (new URL(request.url).searchParams.get("poll") === "1") return json({ traces });
    const { owner, ownerName, pw, ...rest } = meta;
    ctx.waitUntil?.(countGuest(env, id));
    return json({ analysis: withScore({ ...rest, opts: optsOf(meta) }, await scoreEvent(env, meta)), traces, you: { uid: 0, organiser: false, visitor: true } });
  }
  if (parts.length !== 3 || !Number.isInteger(n) || !(meta.courses || []).some((c) => c.n === n)) return json({ error: "not found" }, 404);
  if (parts[1] === "map" || parts[1] === "thumb" || parts[1] === "layers") {
    const o = await env.BUCKET.get(`${DATA}${id}/${parts[1]}-${n}`);
    if (!o) return json({ error: "not found" }, 404);
    return new Response(o.body, { headers: { "Content-Type": o.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "private, max-age=3600" } });
  }
  if (parts[1] === "traces") {
    const objs = (await listAll(env, `${DATA}${id}/trace-${n}-`)).filter((o) => o.customMetadata?.vis === "1");
    const bodies = [];
    for (const o of objs) {
      const b = await env.BUCKET.get(o.key);
      if (!b) continue;
      const rec = await b.json().catch(() => null);
      if (rec?.visitors) { rec.lic = ""; bodies.push(rec); }
    }
    return json(bodies, 200, { "Cache-Control": "no-store" });
  }
  return json({ error: "not found" }, 404);
}

/** A visitor without an account opened analysis id today: the day's count, read then written (two at once may count one). */
async function countGuest(env, id) {
  try {
    const key = `${DATA}${id}/gview-${parisDay()}.json`, o = await env.BUCKET.head(key);
    await env.BUCKET.put(key, "", { customMetadata: { n: String((Number(o?.customMetadata?.n) || 0) + 1) } });
  } catch (e) { /* not counted */ }
}
/** An account opened analysis id (kind "view": the analysis, "solo-<n>": circuit n in « Analyse solo »): written once a day. */
async function countUse(env, id, kind, uid) {
  try {
    const key = `${DATA}${id}/${kind}-${uid}.json`, o = await env.BUCKET.head(key), day = parisDay(), m = o?.customMetadata || {};
    if (m.last === day) return;
    await env.BUCKET.put(key, "", { customMetadata: { first: m.first || day, last: day, days: String((Number(m.days) || 0) + 1) } });
  } catch (e) { /* not counted */ }
}

export const onRequest = (ctx) => {
  const parts = [].concat(ctx.params.path || []).map(String).filter(Boolean);
  return parts[0] === "v" ? visitors(ctx, parts.slice(1)) : forUsers(ctx);
};

const forUsers = withUser(async (ctx, user) => {
  const { request, env, params } = ctx;
  if (!env.BUCKET) return json({ error: "storage not configured" }, 500);
  const parts = [].concat(params.path || []).map(String).filter(Boolean);
  const method = request.method;
  let clubMemo;
  const lazyClub = async () => (clubMemo === undefined ? (clubMemo = await clubOf(env, request, user.licence)) : clubMemo);
  TEAMS.clear();

  // ---- the list, a new analysis
  if (!parts.length) {
    if (method === "GET") {
      const url = new URL(request.url), kind = url.searchParams.get("kind"), race = url.searchParams.get("race");
      // the administrators: how much of R2's 10 free GB the site uses (maps are kept as long as their analysis)
      if (url.searchParams.get("stats") && isAdmin(env, user)) {
        const all = await listAll(env, "", false);
        const an = all.filter((o) => o.key.startsWith(DATA) || o.key.startsWith(META));
        return json({ bytes: all.reduce((s, o) => s + o.size, 0), analyses: an.reduce((s, o) => s + o.size, 0),
          maps: an.filter((o) => o.key.includes("/map-")).length, traces: an.filter((o) => o.key.includes("/trace-")).length });
      }
      const objs = await listAll(env, META);
      const counts = await dataCounts(env);
      const out = [];
      for (const o of objs) {
        const m = o.customMetadata || {};
        if (kind && m.kind !== kind) continue;
        if (race && m.race !== race) continue;
        // an analysis saved before its summary had a position, or its creation's date: its summary written again once (its date of
        // change kept)
        // a training opened before its summary named its club (2026-11-05: Desquinemarre's, of the 4th): once an isolate
        const noName = m.kind === "club" && m.orgSet !== "1" && (!m.orgName || BARE.test(m.orgName)) && m.club && !named.has(m.id);
        if ((m.pos === undefined && Number(m.courses) > 0) || m.created === undefined || m.cc === undefined || noName) {
          if (noName) named.add(m.id);
          const full = await loadMeta(env, m.id);
          // its country and organising club (2026-11-04): a competition's from its race; a training of before has neither
          if (full && full.cc === undefined) {
            const r = full.kind === "race" && full.race ? await findRace(env, request, full.race) : null;
            full.cc = r ? r.country || "FR" : ""; full.orgName = r ? clean(r.org, 80) : full.orgName || "";
          }
          // a training's club: its creator's as the results write it (the club it was opened for is a French club number)
          if (full && full.kind === "club" && !full.orgSet && (!full.orgName || BARE.test(full.orgName)) && full.club) {
            const u = full.owner ? await env.DB.prepare("SELECT licence FROM users WHERE id = ?").bind(full.owner).first().catch(() => null) : null;
            const label = u?.licence ? await clubLabel(env, request, u.licence) : null;
            if (label && label.startsWith(full.club)) { full.orgName = clean(label, 80); if (!full.cc) full.cc = "FR"; }
          }
          if (full) { await env.BUCKET.put(o.key, JSON.stringify(full), { httpMetadata: { contentType: "application/json" }, customMetadata: custom(full) }); Object.assign(m, custom(full)); }
        }
        const meta = { ...m, owner: Number(m.owner), courses: [] };
        const org = await isOrganiser(env, user, meta, lazyClub);
        const draft = draftNow(m.draft === "1", m.openAt);
        if (draft && !org) continue;                                         // a draft: its organisers' alone
        // a club's analysis is listed to everyone (owner, 2026-11-07): a non-member is told it is the club's, and may have its code
        let acc;
        if (org || m.vis === "public") acc = "open";
        else if (m.vis === "club") acc = m.club && (await lazyClub()) === m.club ? "open" : "club";
        else if (m.vis === "password") acc = "locked";
        if (!acc) continue;
        out.push({ id: m.id, kind: m.kind, title: m.title, date: m.date, race: m.race, vis: m.vis, code: m.code === "1", ownerName: m.ownerName,
          courses: Number(m.courses) || 0, updated: m.updated, mine: meta.owner === user.id, organiser: org, access: acc,
          draft, openAt: draft && m.openAt ? m.openAt : null, solo: m.solo !== "0", upload: m.up !== "0", pos: m.pos ? m.pos.split(",").map(Number) : null,
          cc: m.cc || "", orgName: m.orgName || "", orgSet: m.orgSet === "1", runners: counts(m.id).runners.size, thumb: firstThumb(counts(m.id)),
          // who opened it (owner, 2026-11-04: « I need a way for an admin to see which organisers own and opened which map
          // analyses »): shown to its organisers; the account's e-mail to the administrators only (below)
          ...(org ? { owner: meta.owner, created: m.created || "", via: m.via || "" } : {}) });
      }
      out.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.updated || "").localeCompare(a.updated || ""));
      if (isAdmin(env, user)) await withEmails(env, out);
      return json({ analyses: out, club: await lazyClub() });
    }
    if (method === "POST") {
      const b = await readBody(request);
      if (!b) return json({ error: "bad request" }, 400);
      if (!(await allow(env, `ancreate:${user.id}`, 20, 86400))) return json({ error: "too many" }, 429);
      const kind = KINDS.includes(b.kind) ? b.kind : null, vis = VIS.includes(b.vis) ? b.vis : null;
      const title = clean(b.title, 120), date = String(b.date || "");
      if (!kind || !vis || title.length < 3 || !DAY.test(date)) return json({ error: "fields" }, 400);
      let race = "", orgClub = "";
      if (kind === "race") {
        // a competition's analysis: by its organising club (or an administrator), one per race — a second asks opens it
        race = clean(b.race, 40);
        const r = await findRace(env, request, race);
        // a race of the list, a declared one, or one of France's calendar not listed yet (owner, 2026-11-21: an event linked to
        // it opens its analysis at once; « Résultats » keeps the agenda's key « a<id> », FFCO's copy merged into it)
        if (!r) return json({ error: "race" }, 400);
        orgClub = orgCode(r.org) || "";
        if (!(await organises(env, request, user, r, await lazyClub()))) return json({ error: "not organiser" }, 403);
        const same = (await listAll(env, META)).find((o) => o.customMetadata?.kind === "race" && o.customMetadata?.race === race);
        if (same) return json({ id: same.customMetadata.id, existing: true });
      }
      const club = await lazyClub();
      if (vis === "club" && !club) return json({ error: "noclub" }, 400);
      // its country and organising club: a competition's own; a training's the creator's site country and club
      let cc = "", orgName = "";
      if (kind === "race") { const r = await findRace(env, request, race); cc = r?.country || "FR"; orgName = clean(r?.org, 80); }
      else { cc = /^[A-Z]{2}$/.test(String(b.country || "")) ? b.country : ""; orgName = clean((await clubLabel(env, request, user.licence)) || b.orgName, 80); }
      let pw = null;
      if (vis === "password") {
        const p = String(b.password || "");
        if (p.length < 2 || p.length > 100) return json({ error: "password" }, 400);
        const h = await hashPassword(p, env);
        pw = { pw_hash: h.hash, pw_salt: h.salt, pw_iter: h.iter };
      }
      // a club's analysis with a code for its invitees
      let code = false;
      if (vis === "club" && b.code) {
        const p = String(b.password || "");
        if (p.length < 2 || p.length > 100) return json({ error: "password" }, 400);
        const h = await hashPassword(p, env);
        pw = { pw_hash: h.hash, pw_salt: h.salt, pw_iter: h.iter };
        code = true;
      }
      const meta = { id: newId(), kind, title, date, race, club: club || "", orgClub, cc, orgName, vis, pw, ...(code ? { code } : {}), owner: user.id, ownerName: user.display_name || "",
        created: nowIso(), updated: nowIso(), courses: [], draft: true, ...(VIA.includes(b.via) ? { via: b.via } : {}) };
      await saveMeta(env, meta);
      await showModule(env, user.id, "orga");        // what the account starts here shows its module (_lib/modules.js, owner 2026-11-12)
      return json({ id: meta.id });
    }
    return json({ error: "method" }, 405);
  }

  // ---- one analysis
  const id = parts[0];
  if (!/^[a-z0-9]{8,16}$/.test(id)) return json({ error: "not found" }, 404);
  const meta = await loadMeta(env, id);
  if (!meta) return json({ error: "not found" }, 404);
  const sub = parts[1] || "";
  const organiser = await isOrganiser(env, user, meta, lazyClub);

  if (sub === "unlock" && method === "POST") {
    if (!(meta.vis === "password" || hasCode(meta)) || !meta.pw) return json({ error: "bad request" }, 400);
    if (!(await allow(env, `anunlock:${user.id}`, 20, 3600))) return json({ error: "too many" }, 429);
    const b = await readBody(request);
    if (!(await checkPassword(String(b?.password || ""), meta.pw, env))) return json({ error: "invalid" }, 401);
    return json({ key: await unlockKey(env, meta, user.id) });
  }

  if (isDraft(meta) && !organiser) return json({ error: "draft" }, 403);
  const acc = await access(ctx, user, meta, lazyClub);
  // a club's analysis to a non-member: whose it is and whom to ask, and whether a code opens it
  if (acc === "club") return json({ error: "club", code: hasCode(meta), org: meta.orgName || "", owner: meta.ownerName || "" }, 403);
  if (acc !== "open") return json({ error: acc === "locked" ? "locked" : "forbidden" }, 403);
  const opts = optsOf(meta);

  if (!sub) {
    if (method === "GET") {
      const traces = (await listAll(env, `${DATA}${id}/trace-`)).map((o) => {
        const m = o.customMetadata || {};
        return { course: Number(m.course), uid: Number(m.uid), name: m.name || "", lic: m.lic || "", updated: m.updated || "", size: o.size };
      });
      // the page's check for new traces (owner, 2026-11-08): the list alone, no visit counted
      if (new URL(request.url).searchParams.get("poll") === "1") return json({ traces });
      const thumbs = organiser ? (await listAll(env, `${DATA}${id}/thumb-`, false)).map((o) => Number(o.key.slice(o.key.lastIndexOf("-") + 1))) : undefined;
      // a runner's visit counted (not the organisers', nor « Analyse solo »'s own read: it counts itself, POST …/solo/<n>)
      if (!organiser && new URL(request.url).searchParams.get("for") !== "solo") ctx.waitUntil?.(countUse(env, id, "view", user.id));
      // the administrators: the e-mail of the account that opened it
      const creator = isAdmin(env, user) ? (await withEmails(env, [{ owner: meta.owner }]))[0] : null;
      return json({ analysis: withScore(publicMeta(meta), await scoreEvent(env, meta)), traces, you: { uid: user.id, organiser }, ...(thumbs ? { thumbs } : {}), ...(creator?.ownerEmail ? { ownerEmail: creator.ownerEmail } : {}) });
    }
    if (!organiser) return json({ error: "forbidden" }, 403);
    if (method === "PUT") {
      const b = await readBody(request);
      if (!b) return json({ error: "bad request" }, 400);
      if (b.title != null) { const tt = clean(b.title, 120); if (tt.length < 3) return json({ error: "fields" }, 400); meta.title = tt; }
      if (b.date != null) { if (!DAY.test(String(b.date))) return json({ error: "fields" }, 400); meta.date = String(b.date); }
      // the club written under the analysis's name in the lists, as the organisers want it, or none (owner, 2026-11-07)
      if (b.orgName != null) { meta.orgName = clean(b.orgName, 80); meta.orgSet = true; }
      if (b.vis != null) {
        if (!VIS.includes(b.vis)) return json({ error: "fields" }, 400);
        if (b.vis === "club" && !meta.club) { meta.club = (await lazyClub()) || ""; if (!meta.club) return json({ error: "noclub" }, 400); }
        meta.vis = b.vis;
      }
      if (b.visitors != null) meta.visitors = !!b.visitors;
      // published now, kept a draft, or a draft until its opening (a time to come)
      if (b.draft != null) { if (b.draft) meta.draft = true; else { delete meta.draft; delete meta.openAt; } }
      if (b.openAt !== undefined) {
        if (!b.openAt) delete meta.openAt;
        else {
          const at = Date.parse(String(b.openAt));
          if (!Number.isFinite(at) || at <= Date.now() || at > Date.now() + 400 * 86400e3) return json({ error: "openAt" }, 400);
          meta.draft = true; meta.openAt = new Date(at).toISOString();
        }
      }
      if (meta.openAt && !isDraft(meta)) { delete meta.draft; delete meta.openAt; }   // its time came: published
      if (b.opts != null) {
        if (typeof b.opts !== "object" || Array.isArray(b.opts)) return json({ error: "fields" }, 400);
        const o = { ...optsOf(meta), rv: 1 };
        for (const k of Object.keys(OPTS)) if (typeof b.opts[k] === "boolean") o[k] = b.opts[k];
        meta.opts = o;
      }
      if (meta.vis !== "public") meta.visitors = false;                     // open to visitors only when open to every account
      if (b.password) {
        const p = String(b.password);
        if (p.length < 2 || p.length > 100) return json({ error: "password" }, 400);
        const h = await hashPassword(p, env);
        meta.pw = { pw_hash: h.hash, pw_salt: h.salt, pw_iter: h.iter };
      }
      // the club's code for its invitees: a club's analysis only
      if (b.code != null) { if (b.code && meta.vis === "club") meta.code = true; else delete meta.code; }
      if (meta.vis !== "club") delete meta.code;
      if ((meta.vis === "password" || meta.code) && !meta.pw) return json({ error: "password" }, 400);
      // a password or code no longer used goes (its keys with it): ticking the code again asks for a new one
      if (meta.vis !== "password" && !meta.code) delete meta.pw;
      if (b.courses != null) {
        const cs = cleanCourses(b.courses);
        if (!cs) return json({ error: "courses" }, 400);
        // the circuits removed: their maps and traces go
        const gone = (meta.courses || []).filter((c) => !cs.some((x) => x.n === c.n)).map((c) => c.n);
        if (gone.length) {
          const keys = (await listAll(env, `${DATA}${id}/`, false)).map((o) => o.key)
            .filter((k) => gone.some((n) => k === `${DATA}${id}/map-${n}` || k === `${DATA}${id}/thumb-${n}` || k === `${DATA}${id}/layers-${n}` || k.startsWith(`${DATA}${id}/trace-${n}-`) || k.startsWith(`${DATA}${id}/solo-${n}-`)));
          for (let i = 0; i < keys.length; i += 1000) await env.BUCKET.delete(keys.slice(i, i + 1000));
        }
        const sig = (c) => JSON.stringify([c.map?.v, c.map?.w, c.map?.h, c.r, c.score, (c.controls || []).map((q) => [q.kind, Math.round(q.x), Math.round(q.y)])]);
        const stale = cs.filter((c) => { const o = (meta.courses || []).find((x) => x.n === c.n); return o && sig(o) !== sig(c); }).map((c) => `${DATA}${id}/thumb-${c.n}`);
        // the layers of a circuit whose record no longer names them (its map replaced): gone
        for (const c of cs) { const o = (meta.courses || []).find((x) => x.n === c.n); if (o?.layers && !c.layers) stale.push(`${DATA}${id}/layers-${c.n}`); }
        if (stale.length) await env.BUCKET.delete(stale);
        meta.courses = cs;
      }
      await saveMeta(env, meta);
      return json({ ok: true, analysis: publicMeta(meta) });
    }
    if (method === "DELETE") {
      const keys = (await listAll(env, `${DATA}${id}/`, false)).map((o) => o.key);
      for (let i = 0; i < keys.length; i += 1000) await env.BUCKET.delete(keys.slice(i, i + 1000));
      await env.BUCKET.delete(`${META}${id}.json`);
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "stats" && method === "GET") {
    if (!organiser) return json({ error: "forbidden" }, 403);
    return json(await statsOf(env, meta), 200, { "Cache-Control": "no-store" });
  }

  // the files the circuits were imported from, for the event's course setting: the organisers' alone
  if (sub === "source") {
    if (!organiser) return json({ error: "forbidden" }, 403);
    const pre = `${DATA}${id}/src-`;
    if (parts.length === 2 && method === "GET") {
      const files = (await listAll(env, pre)).map((o) => ({ i: Number(o.key.slice(pre.length)), name: o.customMetadata?.name || "", size: o.size,
        at: o.customMetadata?.at || "" })).filter((x) => Number.isInteger(x.i)).sort((x, y) => x.i - y.i);
      return json({ files }, 200, { "Cache-Control": "no-store" });
    }
    if (parts.length === 2 && method === "DELETE") {
      const keys = (await listAll(env, pre, false)).map((o) => o.key);
      if (keys.length) await env.BUCKET.delete(keys);
      return json({ ok: true });
    }
    const i = Number(parts[2]);
    if (parts.length !== 3 || !Number.isInteger(i) || i < 0 || i > 7) return json({ error: "not found" }, 404);
    if (method === "GET") {
      const o = await env.BUCKET.get(`${pre}${i}`);
      if (!o) return json({ error: "not found" }, 404);
      return new Response(o.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, no-store",
        "X-File-Name": encodeURIComponent(o.customMetadata?.name || `file-${i}`) } });
    }
    if (method === "PUT") {
      const name = clean(new URL(request.url).searchParams.get("name") || "", 120);
      if (!/\.(ocd|omap|xmap)$/i.test(name)) return json({ error: "type" }, 415);
      const size = Number(request.headers.get("Content-Length") || 0);
      if (!size) return json({ error: "empty" }, 400);
      if (size > MAX_MAP) return json({ error: "too big" }, 413);
      if (!(await allow(env, `anmap:${user.id}`, 60, 86400))) return json({ error: "too many" }, 429);
      await env.BUCKET.put(`${pre}${i}`, request.body, { httpMetadata: { contentType: "application/octet-stream" }, customMetadata: { name, at: nowIso() } });
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  const n = Number(parts[2]);
  if (!Number.isInteger(n) || n < 0 || n > 99) return json({ error: "not found" }, 404);
  const course = (meta.courses || []).find((c) => c.n === n);

  if (sub === "solo" && method === "POST") {
    if (!course || !opts.solo) return json({ error: "not found" }, 404);
    if (!organiser) await countUse(env, id, `solo-${n}`, user.id);
    return json({ ok: true });
  }

  if (sub === "map") {
    const key = `${DATA}${id}/map-${n}`;
    if (method === "GET") {
      const o = await env.BUCKET.get(key);
      if (!o) return json({ error: "not found" }, 404);
      return new Response(o.body, { headers: { "Content-Type": o.httpMetadata?.contentType || "image/jpeg", "Cache-Control": "private, max-age=3600" } });
    }
    if (method === "PUT") {
      if (!organiser) return json({ error: "forbidden" }, 403);
      const type = (request.headers.get("Content-Type") || "").split(";")[0].trim();
      if (!/^image\/(png|jpeg|webp)$/.test(type)) return json({ error: "type" }, 415);
      const size = Number(request.headers.get("Content-Length") || 0);
      if (!size) return json({ error: "empty" }, 400);
      if (size > MAX_MAP) return json({ error: "too big" }, 413);
      if (!(await allow(env, `anmap:${user.id}`, 60, 86400))) return json({ error: "too many" }, 429);
      await env.BUCKET.put(key, request.body, { httpMetadata: { contentType: type } });
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "thumb") {
    const key = `${DATA}${id}/thumb-${n}`;
    if (method === "GET") {
      const o = await env.BUCKET.get(key);
      if (!o) return json({ error: "not found" }, 404);
      return new Response(o.body, { headers: { "Content-Type": o.httpMetadata?.contentType || "image/webp", "Cache-Control": "private, max-age=3600" } });
    }
    if (method === "PUT") {
      if (!organiser || !course) return json({ error: "forbidden" }, 403);
      const type = (request.headers.get("Content-Type") || "").split(";")[0].trim();
      if (!/^image\/(png|jpeg|webp)$/.test(type)) return json({ error: "type" }, 415);
      const body = await request.arrayBuffer();
      if (!body.byteLength) return json({ error: "empty" }, 400);
      if (body.byteLength > MAX_THUMB) return json({ error: "too big" }, 413);
      await env.BUCKET.put(key, body, { httpMetadata: { contentType: type } });
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "layers") {
    const key = `${DATA}${id}/layers-${n}`;
    if (method === "GET") {
      const o = await env.BUCKET.get(key);
      if (!o) return json({ error: "not found" }, 404);
      return new Response(o.body, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "private, max-age=3600" } });
    }
    if (method === "PUT") {
      if (!organiser) return json({ error: "forbidden" }, 403);          // sent before the circuit's record, as its map is
      const size = Number(request.headers.get("Content-Length") || 0);
      if (!size) return json({ error: "empty" }, 400);
      if (size > MAX_LAYERS) return json({ error: "too big" }, 413);
      if (!(await allow(env, `anmap:${user.id}`, 60, 86400))) return json({ error: "too many" }, 429);
      await env.BUCKET.put(key, request.body, { httpMetadata: { contentType: "application/octet-stream" } });
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }

  if (sub === "extras") {
    if (!course) return json({ error: "not found" }, 404);
    if (method !== "PUT") return json({ error: "method" }, 405);
    if (!organiser) return json({ error: "forbidden" }, 403);
    if (Number(request.headers.get("Content-Length") || 0) > 512 * 1024) return json({ error: "too big" }, 413);
    const b = await readBody(request);
    if (!b) return json({ error: "bad request" }, 400);
    if (b.variants !== undefined) {
      const v = cleanVariants(b.variants);
      if (!v) return json({ error: "fields" }, 400);
      if (Object.keys(v).length) course.variants = v; else delete course.variants;
    }
    if (b.exercises !== undefined) {
      if (meta.kind !== "club") return json({ error: "fields" }, 400);         // a training's
      const x = cleanExercises(b.exercises);
      if (!x) return json({ error: "fields" }, 400);
      if (x.length) course.exercises = x; else delete course.exercises;
    }
    await saveMeta(env, meta);
    return json({ ok: true, course });
  }

  if (sub === "traces" && method === "GET") {
    const objs = await listAll(env, `${DATA}${id}/trace-${n}-`, false);
    const bodies = [];
    for (const o of objs) { const b = await env.BUCKET.get(o.key); if (b) bodies.push(await b.text()); }
    return new Response(`[${bodies.join(",")}]`, { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
  }

  if (sub === "trace") {
    if (!course) return json({ error: "not found" }, 404);
    if (method === "PUT") {
      const size = Number(request.headers.get("Content-Length") || 0);
      if (size > MAX_TRACE) return json({ error: "too big" }, 413);
      if (!opts.upload && !organiser) return json({ error: "closed" }, 403);   // the organisers closed it to new traces
      if (!(await allow(env, `antrace:${user.id}`, 100, 86400))) return json({ error: "too many" }, 429);
      const b = await readBody(request);
      if (b?.consent !== true) return json({ error: "consent" }, 400);
      const tr = cleanTrace(b?.trace);
      if (!tr) return json({ error: "trace" }, 400);
      // the runner is the account: no trace in someone else's name — but an administrator's test traces (`test`: 1-999),
      // each a runner of its own named after the administrator, « <name> #k », without a licence
      const k = b.test;
      if (k != null && !(isAdmin(env, user) && Number.isInteger(k) && k >= 1 && k <= TEST_MAX)) return json({ error: "forbidden" }, 403);
      const uid = k != null ? testUid(user.id, k) : user.id;
      const name = (user.display_name || "") + (k != null ? ` #${k}` : "");
      // a route drawn by hand is not a trace to compare with the others' (owner, 2026-11-02): refused
      if (b.drawn != null) return json({ error: "drawn" }, 400);
      const note = opts.notes ? cleanNote(b.note) : "";
      const vis = b.visitors === true && !!meta.visitors;                     // the runner agreed to be seen by visitors too
      const rec = { ...tr, uid, name, lic: k != null ? "" : user.licence || "", course: n, updated: nowIso(), ...(k != null ? { test: true } : {}),
        ...(note ? { note } : {}), ...(vis ? { visitors: true } : {}) };
      await env.BUCKET.put(`${DATA}${id}/trace-${n}-${uid}.json`, JSON.stringify(rec), {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { uid: String(uid), name: rec.name, lic: String(rec.lic), course: String(n), updated: rec.updated, ...(k != null ? { test: "1" } : {}), ...(vis ? { vis: "1" } : {}), ...(note ? { note: "1" } : {}) } });
      return json({ ok: true, uid });
    }
    if (method === "PATCH") {                                                 // one's own comment, the trace unchanged
      const b = await readBody(request);
      const key = `${DATA}${id}/trace-${n}-${user.id}.json`, o = await env.BUCKET.get(key);
      if (!o) return json({ error: "not found" }, 404);
      const rec = await o.json().catch(() => null);
      if (!rec) return json({ error: "not found" }, 404);
      if (b && "note" in b && !opts.notes) return json({ error: "closed" }, 403);
      if (b && "note" in b) { const note = cleanNote(b.note); if (note) rec.note = note; else delete rec.note; }
      const cm = { ...(o.customMetadata || {}) };
      if (rec.note) cm.note = "1"; else delete cm.note;
      if (b && "visitors" in b) { if (b.visitors === true && meta.visitors) { rec.visitors = true; cm.vis = "1"; } else { delete rec.visitors; delete cm.vis; } }
      await env.BUCKET.put(key, JSON.stringify(rec), { httpMetadata: { contentType: "application/json" }, customMetadata: cm });
      return json({ ok: true, note: rec.note || "", visitors: !!rec.visitors });
    }
    if (method === "DELETE" && parts[3] === "tests") {                        // an administrator's test traces on circuit n
      if (!isAdmin(env, user)) return json({ error: "forbidden" }, 403);
      const keys = (await listAll(env, `${DATA}${id}/trace-${n}-`, false)).map((o) => o.key)
        .filter((key) => testOwner(Number(key.slice(key.lastIndexOf("-") + 1, -5))) === user.id);
      for (let i = 0; i < keys.length; i += 1000) await env.BUCKET.delete(keys.slice(i, i + 1000));
      return json({ ok: true, removed: keys.length });
    }
    if (method === "DELETE") {
      const uid = parts[3] != null ? Number(parts[3]) : user.id;
      if (!Number.isInteger(uid)) return json({ error: "bad request" }, 400);
      if (uid !== user.id && !organiser) return json({ error: "forbidden" }, 403);
      await env.BUCKET.delete(`${DATA}${id}/trace-${n}-${uid}.json`);
      return json({ ok: true });
    }
    return json({ error: "method" }, 405);
  }
  return json({ error: "not found" }, 404);
});

/** What the organisers decide on (owner, 2026-11-04): per circuit the traces shared, the comments and the visitors' consents,
 *  the accounts that replayed it alone; for the analysis the accounts that opened it, the runners, those who replayed alone
 *  without sharing a trace, the visitors without an account. Counts only: never who. */
async function statsOf(env, meta) {
  const id = meta.id, objs = await listAll(env, `${DATA}${id}/`);
  const courses = new Map((meta.courses || []).map((c) => [c.n, { n: c.n, name: c.name, traces: 0, tests: 0, notes: 0, visitors: 0, solo: 0, soloOnly: 0, last: "" }]));
  const tracers = new Set(), byCourse = new Map(), soloBy = new Map(), soloAll = new Set();
  let viewers = 0, viewDays = 0, recent = 0, guests = 0, lastView = "", lastTrace = "";
  const week = new Date(Date.now() - 7 * 86400e3).toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  for (const o of objs) {
    const name = o.key.slice(`${DATA}${id}/`.length), m = o.customMetadata || {};
    let x;
    if ((x = /^trace-(\d+)-(\d+)\.json$/.exec(name))) {
      const c = courses.get(Number(x[1]));
      if (!c) continue;
      if (m.test === "1") { c.tests += 1; continue; }
      c.traces += 1; if (m.note === "1") c.notes += 1; if (m.vis === "1") c.visitors += 1;
      if ((m.updated || "") > c.last) c.last = m.updated;
      if ((m.updated || "") > lastTrace) lastTrace = m.updated;
      tracers.add(x[2]);
      if (!byCourse.has(c.n)) byCourse.set(c.n, new Set());
      byCourse.get(c.n).add(x[2]);
    } else if ((x = /^solo-(\d+)-(\d+)\.json$/.exec(name))) {
      if (!courses.has(Number(x[1]))) continue;
      if (!soloBy.has(Number(x[1]))) soloBy.set(Number(x[1]), new Set());
      soloBy.get(Number(x[1])).add(x[2]); soloAll.add(x[2]);
    } else if (/^view-\d+\.json$/.test(name)) {
      viewers += 1; viewDays += Number(m.days) || 1;
      if ((m.last || "") >= week) recent += 1;
      if ((m.last || "") > lastView) lastView = m.last;
    } else if (/^gview-\d{4}-\d{2}-\d{2}\.json$/.test(name)) guests += Number(m.n) || 0;
  }
  for (const [n, set] of soloBy) {
    const c = courses.get(n), mine = byCourse.get(n) || new Set();
    c.solo = set.size; c.soloOnly = [...set].filter((u) => !mine.has(u)).length;
  }
  return { courses: [...courses.values()], viewers, viewDays, recent, guests, runners: tracers.size, solo: soloAll.size,
    soloOnly: [...soloAll].filter((u) => !tracers.has(u)).length, lastView, lastTrace, created: meta.created || "" };
}

/** The administrators' view: each analysis's opener's e-mail (`ownerEmail`), read from the accounts in one query. */
async function withEmails(env, list) {
  const ids = [...new Set(list.map((a) => Number(a.owner)).filter((n) => Number.isInteger(n) && n > 0))];
  if (!ids.length || !env.DB) return list;
  try {
    const rows = (await env.DB.prepare(`SELECT id, email FROM users WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all()).results || [];
    const by = new Map(rows.map((r) => [Number(r.id), r.email]));
    for (const a of list) if (by.has(Number(a.owner))) a.ownerEmail = by.get(Number(a.owner));
  } catch (e) { /* the names alone */ }
  return list;
}
