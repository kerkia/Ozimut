// Ozimut's own plans (owner, 2026-11-25; docs/billing/design.md §1-§3, §7; migration 0034): the switch, the catalogue of
// capabilities, the packaging (what each plan holds, as data), prices and the seller's identity as data, the entitlements of
// an account or an org, grants, the metered usage. The one place: a feature names a capability (capOf, entitlementsOf),
// never a plan. Everything answers before the migration (the « launch » pack, nobody on a plan), and an account without
// anything costs one small D1 read every few seconds an isolate (ANY below), nothing more.
//
// A subject is « u<user id> », « o<org id> », « e<event id> », « f<CC> » (a country's federation), « fo<org id> » (a league or
// a committee).

import { isAdmin, json, nowIso, parisToday, previewOf } from "./api.js";
import { orgByCode, orgOfEvent } from "./orgs.js";

// ---- §1 the switch ---------------------------------------------------------------------------------------------------
/** "off" | "test" | "live" (wrangler.toml BILLING; anything else: off). */
export const billingMode = (env) => (["test", "live"].includes(String(env?.BILLING || "")) ? String(env.BILLING) : "off");
/** May this account see and use billing? off: nobody; test: administrators and the « billing » previewers; live: everyone. */
export function billingOn(env, user) {
  const m = billingMode(env);
  if (m === "live") return true;
  if (m !== "test" || !user) return false;
  return isAdmin(env, user) || previewOf(user).includes("billing");
}
/** Today in Paris, YYYY-MM-DD. */
export const today = () => parisToday();
const month = () => today().slice(0, 7);

// ---- is migration 0034 applied? (a yes kept for the isolate, a no asked again after a minute) -------------------------------
let READY = null, READY_AT = 0;
export async function ready(env) {
  if (READY === true || (READY === false && Date.now() - READY_AT < 60e3)) return READY;
  try {
    await env.DB.prepare("SELECT (SELECT 1 FROM billing_config LIMIT 1), (SELECT 1 FROM subscriptions LIMIT 1), (SELECT 1 FROM grants LIMIT 1), (SELECT 1 FROM usage_counters LIMIT 1)").first();
    READY = true;
  } catch (e) { READY = false; }
  READY_AT = Date.now();
  return READY;
}
/** A D1 error that says the migration is missing (the routes then answer 503 « not ready »). */
export const notReady = (e) => /no such (table|column)/i.test(String(e?.message || e));

// ---- §2 plans, capabilities, packaging ---------------------------------------------------------------------------------
export const PLANS = {
  free: { for: "person", rank: 0 },
  plus: { for: "person", rank: 1 },
  club: { for: "org", rank: 2 },
  "fed-clubs": { for: "federation", rank: 3 },     // every club of the federation has « club »
  "fed-all": { for: "federation", rank: 4 },       // and every licensee has « plus »
};
const GRANT_PLANS = ["plus", "club", "fed-clubs", "fed-all"];
export const REASONS = ["trial", "founder", "gift", "staff", "agreement", "event", "trust", "pilot"];

// kind: flag | limit; unit: what a limit counts; module: where it shows; scope: whose it is — "user" (an account's), "org" (a
// club's own), "event" (a club's, also bought for one event)
export const CAPS = {
  mymapsMB: { kind: "limit", unit: "MB", module: "coach", scope: "user" },
  lidarPerDay: { kind: "limit", unit: "day", module: "carto", scope: "user" },
  townPerDay: { kind: "limit", unit: "day", module: "carto", scope: "user" },
  genKm2Month: { kind: "limit", unit: "km2", module: "carto", scope: "user" },
  aiPerDay: { kind: "limit", unit: "day", module: "stats", scope: "user" },
  aiStrong: { kind: "flag", unit: "", module: "stats", scope: "user" },
  cartoVersions: { kind: "limit", unit: "versions", module: "carto", scope: "user" },
  routesOwnSpeeds: { kind: "flag", unit: "", module: "coach", scope: "user" },
  routeVariants: { kind: "flag", unit: "", module: "coach", scope: "user" },
  headcamVideo: { kind: "flag", unit: "", module: "coach", scope: "user" },
  analysisExport: { kind: "flag", unit: "", module: "coach", scope: "user" },
  pixelOwnMap: { kind: "flag", unit: "", module: "pixel", scope: "user" },
  orgmapsMB: { kind: "limit", unit: "MB", module: "orga", scope: "org" },
  chronoCompetition: { kind: "flag", unit: "", module: "orga", scope: "event" },
};
/** The pack's columns: a plan's own value (free, plus, club), what a club's plan gives its members (member, u21) and opens on
 *  its events and analyses (participant). A column left out gives nothing of its own (plus and club: as free; u21: as plus). */
export const COLUMNS = ["free", "plus", "club", "member", "participant", "u21"];

const ANALYSIS_FLAGS = ["routesOwnSpeeds", "routeVariants", "headcamVideo", "analysisExport"];
const LIMITS_TODAY = { mymapsMB: 1024, lidarPerDay: 5, townPerDay: 3, genKm2Month: null, aiPerDay: 15, cartoVersions: 60, orgmapsMB: 3072 };
function launchPack() {
  const p = {};
  for (const [k, c] of Object.entries(CAPS)) p[k] = { free: c.kind === "flag" ? k !== "aiStrong" : LIMITS_TODAY[k] };
  return p;
}
function v1Pack() {
  const p = {
    mymapsMB: { free: 1024, plus: 25600 },
    lidarPerDay: { free: 5, plus: 20 },
    townPerDay: { free: 3, plus: 10 },
    genKm2Month: { free: 10, plus: 60 },
    aiPerDay: { free: 15, plus: 100 },
    aiStrong: { free: false, plus: true },
    cartoVersions: { free: 60, plus: null },
    pixelOwnMap: { free: false, plus: true },
    orgmapsMB: { free: 3072, club: 20480 },
    chronoCompetition: { free: false, club: true },
  };
  for (const k of ANALYSIS_FLAGS) p[k] = { free: false, plus: true, participant: true };
  return p;
}
export const PACKS = { launch: launchPack(), v1: v1Pack() };

export const DEFAULTS = {
  pack: { base: "launch", set: {} },
  // amounts in cents, euros
  prices: {
    plus: { year: 2900, founder: 1900, founderUntil: "", stripe: { year: "", founder: "" } },
    club: { year: 12000, small: 9000, smallMax: 50 },
    fed: { clubs: 60, all: 200 },                    // cents per licensee a year
    event: { perEntry: 20, cap: 2500 },
    mapPack: { km2: 10, amount: 1000, stripe: "" },
    trialDays: 30, currency: "eur",
  },
  seller: { name: "", form: "", capital: "", address: "", country: "", siren: "", siret: "", rcs: "", vat: 0, vatNote: "", iban: "",
    bic: "", email: "", mediator: "", mediatorUrl: "" },
  sell: { individuals: "none", mor: { on: false, countries: [], params: {} } },
  texts: {},
  changes: [],                                       // the public « Ce qui change » entries
};

// ---- the stored configuration and « does anybody hold anything? », read together and kept a while ---------------------------
const CONFIG_MS = 60e3, ANY_MS = 15e3;
let CFG = null, CFG_AT = 0, ANY = null, ANY_AT = 0, PACK = null;
/** Forget what this isolate keeps (after a write to the billing tables made outside this module). */
export function changed() { CFG = null; ANY = null; PACK = null; }

const plain = (v) => v && typeof v === "object" && !Array.isArray(v);
function merge(base, over) {
  if (!plain(base) || !plain(over)) return over === undefined ? base : over;
  const out = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = plain(v) && plain(base[k]) ? merge(base[k], v) : v;
  return out;
}
const copy = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** One batch: the config rows (when due) and whether any subscription or grant is in force (when due). */
async function load(env) {
  const now = Date.now(), needCfg = !CFG || now - CFG_AT > CONFIG_MS, needAny = ANY === null || now - ANY_AT > ANY_MS;
  if (!needCfg && !needAny) return;
  if (READY === false && now - READY_AT < 60e3) { CFG = CFG || {}; ANY = false; CFG_AT = ANY_AT = now; return; }
  try {
    const st = [];
    if (needCfg) st.push(env.DB.prepare("SELECT k, json FROM billing_config"));
    if (needAny) st.push(env.DB.prepare(`SELECT (SELECT COUNT(*) FROM subscriptions WHERE status IN ('active', 'past_due') AND ended_at IS NULL)
      + (SELECT COUNT(*) FROM grants WHERE ended_at IS NULL) AS n`));
    const res = await env.DB.batch(st);
    if (needCfg) {
      const c = {};
      for (const r of res[0].results || []) { try { c[r.k] = JSON.parse(r.json); } catch (e) { /* a bad row: the default */ } }
      CFG = c; CFG_AT = now; PACK = null;
    }
    if (needAny) { ANY = Number((res[needCfg ? 1 : 0].results || [])[0]?.n) > 0; ANY_AT = now; }
    READY = true;
  } catch (e) {
    // before the migration (or D1 failing): the defaults, nobody on a plan — asked again later
    if (notReady(e)) { READY = false; READY_AT = now; }
    CFG = CFG || {}; CFG_AT = now; PACK = null;
    ANY = false; ANY_AT = now;
  }
}

/** A configuration value (pack | prices | seller | sell | texts | changes): what is stored, over DEFAULTS[k]. */
export async function config(env, k) {
  await load(env);
  return merge(copy(DEFAULTS[k]), CFG?.[k]);
}
export async function setConfig(env, k, value, userId) {
  if (!(k in DEFAULTS)) throw new Error("unknown config key");
  await env.DB.prepare(`INSERT INTO billing_config (k, json, updated_at, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT (k) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(k, JSON.stringify(value ?? null), nowIso(), userId || null).run();
  CFG = null; PACK = null;
}

/** A pack resolved: every capability with its six columns filled (plus and club as free, u21 as plus, when left out; member and
 *  participant left undefined when they give nothing). */
export function resolvePack(stored) {
  const base = PACKS[stored?.base] ? stored.base : "launch";
  const caps = {};
  for (const k of Object.keys(CAPS)) {
    const v = { ...(PACKS[base][k] || {}), ...(plain(stored?.set?.[k]) ? stored.set[k] : {}) };
    const flag = CAPS[k].kind === "flag";
    const clean = (x) => (x === undefined ? undefined : flag ? !!x : x === null ? null : Number.isFinite(Number(x)) ? Number(x) : undefined);
    const o = {};
    for (const c of COLUMNS) o[c] = clean(v[c]);
    if (o.free === undefined) o.free = flag ? false : 0;
    if (o.plus === undefined) o.plus = o.free;
    if (o.club === undefined) o.club = o.free;
    if (o.u21 === undefined) o.u21 = o.plus;
    caps[k] = o;
  }
  return { base, caps };
}
/** The pack in force: { base, caps: { key: { free, plus, club, member, participant, u21 } } }. */
export async function packOf(env) {
  await load(env);
  if (!PACK) PACK = resolvePack(merge(copy(DEFAULTS.pack), CFG?.pack));
  return PACK;
}

/** A storage limit in bytes from its capability's value in MB (null: none). `override` (an env var, MB) stands for the free
 *  value while the account holds no more than it (MYMAPS_QUOTA_MB, ORGMAPS_QUOTA_MB: the local test configurations). */
export async function bytesOf(env, key, value, override) {
  if (value === null) return null;
  const free = (await packOf(env)).caps[key].free, o = Number(override);
  const mb = o > 0 && value === free ? o : value;
  return Math.max(1, Number(mb) || 0) * 1024 * 1024;
}

// ---- values: the most generous wins (true over false, the larger limit, null = unlimited over any number) ------------------
/** Is `a` more generous than `b` for this capability? (undefined: gives nothing) */
export function better(key, a, b) {
  if (a === undefined) return false;
  if (b === undefined) return true;
  if (CAPS[key]?.kind === "flag") return !!a && !b;
  if (b === null) return false;
  return a === null || a > b;
}
const most = (key, a, b) => (better(key, a, b) ? a : b);
/** A limit raised to `n` at least (null stays unlimited): the administrators' own allowances. */
export const atLeast = (limit, n) => (limit === null ? null : Math.max(Number(limit) || 0, n));

// ---- subscriptions and grants ----------------------------------------------------------------------------------------------
const subLive = (s, day) => !!s && !s.ended_at && (s.status === "active" || s.status === "past_due") && (!s.current_end || String(s.current_end).slice(0, 10) >= day);
const grantLive = (g, day) => !!g && !g.ended_at && (!g.until || g.until >= day);
const rank = (p) => PLANS[p]?.rank || 0;
const later = (a, b) => (a === null || a === undefined ? true : b === null || b === undefined ? false : a > b);   // is `a` a later end than `b`?
/** The best of a subject's rows: { plan, until, why: { kind, reason, id } } or null. */
function best(sub, grants, day) {
  let out = null;
  if (subLive(sub, day)) out = { plan: sub.plan, until: sub.current_end ? String(sub.current_end).slice(0, 10) : null, why: { kind: "sub", reason: sub.source || "stripe", id: sub.stripe_sub || sub.subject } };
  let g = null;
  for (const x of grants || []) {
    if (!grantLive(x, day)) continue;
    if (!g || rank(x.plan) > rank(g.plan) || (rank(x.plan) === rank(g.plan) && later(x.until, g.until) && x.until !== g.until)) g = x;
  }
  // a subscription first; a grant only when it is of a higher plan
  if (g && (!out || rank(g.plan) > rank(out.plan))) out = { plan: g.plan, until: g.until || null, why: { kind: "grant", reason: g.reason, id: g.id } };
  return out;
}
/** The rows of several subjects in one batch: Map(subject -> { sub, grants }). Empty without anything in force anywhere. */
async function rowsOf(env, subjects) {
  const out = new Map();
  const list = [...new Set(subjects.filter(Boolean))];
  if (!list.length) return out;
  await load(env);
  if (!ANY) return out;
  try {
    const marks = list.map(() => "?").join(",");
    const [s, g] = await env.DB.batch([
      env.DB.prepare(`SELECT * FROM subscriptions WHERE subject IN (${marks})`).bind(...list),
      env.DB.prepare(`SELECT * FROM grants WHERE subject IN (${marks}) AND ended_at IS NULL`).bind(...list),
    ]);
    for (const x of list) out.set(x, { sub: null, grants: [] });
    for (const r of s.results || []) out.get(r.subject).sub = r;
    for (const r of g.results || []) out.get(r.subject).grants.push(r);
  } catch (e) { /* before the migration: nothing */ }
  return out;
}
const planIn = (rows, subject, day) => { const r = rows.get(subject); return r ? best(r.sub, r.grants, day) : null; };

/** A subject's plan: an active subscription (or past_due within its period), else its most generous grant in force. */
export async function subjectPlan(env, subject) {
  return planIn(await rowsOf(env, [String(subject || "")]), String(subject || ""), today());
}

// ---- orgs ------------------------------------------------------------------------------------------------------------------
/** The org with its two levels above (France: club → committee → league), or null (also before migration 0030). */
async function orgTree(env, orgId) {
  const id = Number(orgId);
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    return (await env.DB.prepare(`SELECT o.id, o.cc, o.kind, o.name, o.parent, p.name AS pname, p.parent AS gparent, g.name AS gname
      FROM orgs o LEFT JOIN orgs p ON p.id = o.parent LEFT JOIN orgs g ON g.id = p.parent WHERE o.id = ?`).bind(id).first()) || null;
  } catch (e) { return null; }
}
/** The subjects whose plan covers an org: its own, the leagues or committees above it, its country's federation. */
const orgSubjects = (o) => [`o${o.id}`, o.parent ? `fo${o.parent}` : "", o.gparent ? `fo${o.gparent}` : "", o.cc ? `f${String(o.cc).toUpperCase()}` : ""].filter(Boolean);
/** An org's plan among rows already read: { plan: "club" | null, until, why, name, level } (level: the covering plan as written). */
function orgPlanIn(rows, o, day) {
  let out = { plan: null, until: null, why: null, name: "", level: null };
  const take = (p, name, scope) => {
    if (!p || rank(p.plan) < rank("club")) return;
    if (!out.plan || later(p.until, out.until)) out = { plan: "club", until: p.until, why: { ...p.why, scope }, name, level: p.plan };
    // « fed-all » is kept as the level whatever the end day: it also gives the members « plus »
    if (p.plan === "fed-all") out.level = "fed-all";
  };
  take(planIn(rows, `o${o.id}`, day), o.name, "club");
  if (o.parent) take(planIn(rows, `fo${o.parent}`, day), o.pname || "", "federation");
  if (o.gparent) take(planIn(rows, `fo${o.gparent}`, day), o.gname || "", "federation");
  if (o.cc) take(planIn(rows, `f${String(o.cc).toUpperCase()}`, day), String(o.cc).toUpperCase(), "federation");
  return out;
}
/** An org's plan with the federation scope: { plan: "club" | null, until, why, name }. */
export async function orgPlan(env, orgId) {
  const none = { plan: null, until: null, why: null, name: "" };
  await load(env);
  if (!ANY) return none;
  const o = await orgTree(env, orgId);
  if (!o) return none;
  const r = orgPlanIn(await rowsOf(env, orgSubjects(o)), o, today());
  return { plan: r.plan, until: r.until, why: r.why, name: r.name };
}

// ---- « under 21 »: the licence's category at its latest race (H/D 20 and under), else the account's year of birth ----------
async function under21(env, user, ctx) {
  const lic = String(user?.licence || "");
  if (/^\d+$/.test(lic) && env.ASSETS) {
    try {
      const base = ctx?.request?.url || env.SITE_URL || "https://ozimut.com";
      const res = await env.ASSETS.fetch(new URL(`/data/fr/r/${Math.floor(Number(lic) / 10)}.json`, base));
      const rows = res.ok ? (await res.json())[lic] || [] : [];
      let last = null;
      for (const r of rows) if (r && typeof r[4] === "string" && (!last || r[4] > last[4])) last = r;
      const m = /^[HDMWF]\s*-?(\d{1,2})/i.exec(String(last?.[8] || ""));
      if (m) return Number(m[1]) <= 20;
    } catch (e) { /* the year of birth below */ }
  }
  const y = Number(user?.birth_year);
  return y > 1900 && Number(today().slice(0, 4)) - y < 21;
}

// ---- §3 entitlements ----------------------------------------------------------------------------------------------------
const freeCaps = (pack) => Object.fromEntries(Object.keys(CAPS).map((k) => [k, pack.caps[k].free]));
/** The account's memberships read together: its orgs in force (with their levels above) and its accepted countries. */
async function scopesOf(env, user) {
  const day = today(), orgs = [], ccs = new Set();
  if (user.licence) ccs.add("FR");
  const st = [
    env.DB.prepare(`SELECT o.id, o.cc, o.kind, o.name, o.parent, p.name AS pname, p.parent AS gparent, g.name AS gname, m.state, m.until
      FROM org_members m JOIN orgs o ON o.id = m.org_id LEFT JOIN orgs p ON p.id = o.parent LEFT JOIN orgs g ON g.id = p.parent
      WHERE m.user_id = ? AND m.state = 'ok'`).bind(user.id),
    env.DB.prepare("SELECT country FROM user_countries WHERE user_id = ? AND status = 'ok'").bind(user.id),
  ];
  let res = null;
  try { res = await env.DB.batch(st); } catch (e) {
    // one of the two tables missing (migrations 0014, 0030): each alone
    res = [];
    for (const s of st) { try { res.push(await s.all()); } catch (e2) { res.push({ results: [] }); } }
  }
  for (const r of res[0].results || []) if (!r.until || r.until >= day) orgs.push(r);
  for (const r of res[1].results || []) if (r.country) ccs.add(String(r.country).toUpperCase());
  return { orgs, ccs: [...ccs] };
}

/**
 * What an account may do: { plan, caps: { key: value }, why: { key: { scope, plan, name, until } }, trial: { until } | null }.
 * `user` may be null (a visitor: the free values, and the context's). `ctx`: { org, event } ids of what is being used (their
 * plan opens the pack's « participant » values), `request` (to read the site's files).
 */
export async function entitlementsOf(env, user, ctx) {
  const pack = await packOf(env);              // (also loads ANY)
  const caps = freeCaps(pack), why = {};
  const out = { plan: "free", caps, why, trial: null };
  if (!ANY) return out;
  const day = today();
  const give = (key, value, w) => { if (better(key, value, caps[key])) { caps[key] = value; why[key] = w; } };
  const giveCol = (col, w, only) => { for (const k of Object.keys(CAPS)) if (!only || only(k)) give(k, pack.caps[k][col], w); };
  const userScope = (k) => CAPS[k].scope === "user";

  // the subjects to read: the person, their orgs and what covers them, their countries' federations, the context
  const subjects = [];
  let sc = { orgs: [], ccs: [] };
  if (user?.id) { subjects.push(`u${user.id}`); sc = await scopesOf(env, user); }
  for (const o of sc.orgs) subjects.push(...orgSubjects(o));
  for (const cc of sc.ccs) subjects.push(`f${cc}`);
  let ctxOrg = null;
  if (ctx?.org) { ctxOrg = sc.orgs.find((o) => o.id === Number(ctx.org)) || await orgTree(env, ctx.org); if (ctxOrg) subjects.push(...orgSubjects(ctxOrg)); }
  if (ctx?.event) subjects.push(`e${ctx.event}`);
  const rows = await rowsOf(env, subjects);

  // 1. the person
  if (user?.id) {
    const r = rows.get(`u${user.id}`);
    const p = r ? best(r.sub, r.grants, day) : null;
    if (p && rank(p.plan) >= rank("plus")) { out.plan = "plus"; giveCol("plus", { scope: "person", plan: "plus", name: "", until: p.until }, userScope); }
    const t = (r?.grants || []).filter((g) => g.reason === "trial" && grantLive(g, day)).sort((a, b) => (later(a.until, b.until) ? -1 : 1))[0];
    if (t && !subLive(r.sub, day)) out.trial = { until: t.until || null };
  }
  // 3. the federation: « fed-all » gives the country's members « plus »
  for (const cc of sc.ccs) {
    const p = planIn(rows, `f${cc}`, day);
    if (p?.plan === "fed-all") { if (out.plan === "free") out.plan = "plus"; giveCol("plus", { scope: "federation", plan: "plus", name: cc, until: p.until }, userScope); }
  }
  // 2. their clubs (and the leagues above them: « fed-all » on a league gives its clubs' members « plus »)
  let young = null;
  for (const o of sc.orgs) {
    const op = orgPlanIn(rows, o, day);
    if (!op.plan) continue;
    const w = { scope: op.why?.scope === "federation" ? "federation" : "club", plan: "club", name: op.name || o.name, until: op.until };
    giveCol("member", w, userScope);
    // the club's own values, for the account's answers (the page of a club the account belongs to)
    giveCol("club", w, (k) => !userScope(k));
    if (op.level === "fed-all") { if (out.plan === "free") out.plan = "plus"; giveCol("plus", { ...w, scope: "federation", plan: "plus" }, userScope); }
    // under 21: looked up only when it would change something
    if (Object.keys(CAPS).some((k) => userScope(k) && better(k, pack.caps[k].u21, caps[k]))) {
      if (young === null) young = await under21(env, user, ctx);
      if (young) giveCol("u21", { ...w, plan: "u21" }, userScope);
    }
  }
  // 4. the context: the organiser's plan, an event bought by the unit
  if (ctxOrg) {
    const op = orgPlanIn(rows, ctxOrg, day);
    if (op.plan) {
      const w = { scope: "event", plan: "club", name: op.name || ctxOrg.name, until: op.until };
      giveCol("participant", w, userScope);
      giveCol("club", w, (k) => !userScope(k));
    }
  }
  if (ctx?.event) {
    const p = planIn(rows, `e${ctx.event}`, day);
    if (p) {
      const w = { scope: "event", plan: "club", name: "", until: p.until };
      giveCol("participant", w, userScope);
      giveCol("club", w, (k) => !userScope(k));
    }
  }
  return out;
}

/** What /api/account/me and the login add: `ent: { caps, why }` always; `billing`, `plan`, `trial` only when billing is on
 *  for the account. */
export async function entCaps(env, user, ctx) {
  let e;
  try { e = await entitlementsOf(env, user, ctx); }
  catch (err) { e = { plan: "free", caps: freeCaps(await packOf(env)), why: {}, trial: null }; }
  return { ent: { caps: e.caps, why: e.why }, ...(billingOn(env, user) ? { billing: true, plan: e.plan, trial: e.trial } : {}) };
}

/** One capability's value for the account (here). An org's or an event's capability is read from `ctx.org` / `ctx.event`. */
export async function capOf(env, user, key, ctx) {
  if (!CAPS[key]) return undefined;
  if (CAPS[key].scope !== "user" && (ctx?.org || ctx?.event)) {
    const pack = await packOf(env);
    let v = pack.caps[key].free;
    if (!ANY) return v;
    if (ctx.org && (await orgPlan(env, ctx.org)).plan) v = most(key, pack.caps[key].club, v);
    if (ctx.event && (await subjectPlan(env, `e${ctx.event}`))) v = most(key, pack.caps[key].club, v);
    return v;
  }
  return (await entitlementsOf(env, user, ctx)).caps[key];
}

/**
 * What an organiser's plan opens to everyone on its event or analysis: { caps: [keys], by: "<club name>" } or null — the
 * flags its « participant » column turns on, and the club's own flags (Chrono for a competition). `org`, `event`: ids.
 * Without any plan anywhere: null at once, no read.
 */
export async function openedBy(env, { org, event } = {}) {
  await load(env);
  if (!ANY || (!org && !event)) return null;
  const pack = await packOf(env), day = today();
  const o = org ? await orgTree(env, org) : null;
  const rows = await rowsOf(env, [...(o ? orgSubjects(o) : []), event ? `e${event}` : ""]);
  const op = o ? orgPlanIn(rows, o, day) : null;
  const ev = event ? planIn(rows, `e${event}`, day) : null;
  if (!op?.plan && !ev) return null;
  const caps = [];
  for (const [k, c] of Object.entries(CAPS)) {
    if (c.kind !== "flag") continue;
    const v = pack.caps[k], col = c.scope === "user" ? v.participant : v.club;
    if (col === true && !v.free) caps.push(k);
  }
  return caps.length ? { caps, by: op?.plan ? op.name || o?.name || "" : "" } : null;
}

/** Does anybody hold anything (a subscription or a grant in force)? Kept a few seconds an isolate. */
export async function anyPlan(env) { await load(env); return !!ANY; }
/** `opened` for an event's row (its org: events.org_id, else resolved by _lib/orgs.js orgOfEvent), or null. */
export async function openedForEvent(env, request, ev) {
  try {
    if (!ev || !(await anyPlan(env))) return null;
    const org = ev.org_id || (await orgOfEvent(env, request, ev))?.id || null;
    return await openedBy(env, { org, event: ev.id });
  } catch (e) { return null; }
}
/** `opened` for a map analysis's meta: its event's (the one holding it, else its competition's), else its organising club's (a
 *  competition's `orgClub`, a training's creator's club `club`: four digits, France's). */
export async function openedForAnalysis(env, request, meta) {
  try {
    if (!meta?.id || !(await anyPlan(env))) return null;
    let ev = null;
    try {
      ev = await env.DB.prepare("SELECT id, org_id, club, country, created_by FROM events WHERE analysis = ? AND status = 'active'").bind(meta.id).first();
      if (!ev && meta.race) ev = await env.DB.prepare("SELECT id, org_id, club, country, created_by FROM events WHERE race_key = ? AND status = 'active'").bind(meta.race).first();
    } catch (e) { ev = null; }
    if (ev) return await openedForEvent(env, request, ev);
    const code = meta.orgClub || (/^\d{4}$/.test(String(meta.club || "")) ? meta.club : "");
    const org = code ? await orgByCode(env, request, "FR", "club", code) : null;
    return org ? await openedBy(env, { org: org.id }) : null;
  } catch (e) { return null; }
}

// ---- grants ------------------------------------------------------------------------------------------------------------------
/** A grant: { subject, plan (plus | club | fed-clubs | fed-all), until (YYYY-MM-DD, its last day; null: no end), reason, note, by }
 *  -> its id. */
export async function addGrant(env, { subject, plan, until = null, reason, note = "", by = null }) {
  if (!/^(u\d+|o\d+|e[\w-]+|f[A-Z]{2}|fo\d+)$/.test(String(subject || "")) || !GRANT_PLANS.includes(plan) || !REASONS.includes(reason)) throw new Error("bad grant");
  if (until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(String(until))) throw new Error("bad grant");
  const r = await env.DB.prepare(`INSERT INTO grants (subject, plan, until, reason, note, by_user, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`)
    .bind(subject, plan, until, reason, String(note || "").slice(0, 500), by || null, nowIso()).first();
  ANY = true; ANY_AT = Date.now();
  return r.id;
}
export async function endGrant(env, id) {
  await env.DB.prepare("UPDATE grants SET ended_at = ? WHERE id = ? AND ended_at IS NULL").bind(nowIso(), Number(id)).run();
  ANY = null;
}
/** Every grant of a subject, the latest first (ended ones too; `live` says whether it is in force today). */
export async function grantsOf(env, subject) {
  try {
    const { results } = await env.DB.prepare("SELECT * FROM grants WHERE subject = ? ORDER BY id DESC").bind(String(subject)).all();
    const day = today();
    return (results || []).map((g) => ({ ...g, live: grantLive(g, day) }));
  } catch (e) { if (notReady(e)) return []; throw e; }
}

// ---- §7 usage ---------------------------------------------------------------------------------------------------------------
const subjectOf = (x) => (typeof x === "string" ? x : `u${x.id}`);
export async function usageOf(env, subject, k, period = month()) {
  try { return Number((await env.DB.prepare("SELECT n FROM usage_counters WHERE subject = ? AND k = ? AND period = ?").bind(subject, k, period).first())?.n) || 0; }
  catch (e) { if (notReady(e)) return 0; throw e; }
}
export async function addUsage(env, subject, k, n, period = month()) {
  if (!(n > 0)) return;
  await env.DB.prepare(`INSERT INTO usage_counters (subject, k, period, n) VALUES (?, ?, ?, ?)
    ON CONFLICT (subject, k, period) DO UPDATE SET n = n + excluded.n`).bind(subject, k, period, n).run();
}
export async function creditsOf(env, subject, k) {
  try { return Number((await env.DB.prepare("SELECT n FROM usage_credits WHERE subject = ? AND k = ?").bind(subject, k).first())?.n) || 0; }
  catch (e) { if (notReady(e)) return 0; throw e; }
}
export async function addCredits(env, subject, k, n) {
  await env.DB.prepare(`INSERT INTO usage_credits (subject, k, n, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT (subject, k) DO UPDATE SET n = n + excluded.n, updated_at = excluded.updated_at`).bind(subject, k, n, nowIso()).run();
}
/** Take `n` credits if the subject holds them: true when taken. */
export async function useCredits(env, subject, k, n) {
  if (!(n > 0)) return true;
  const r = await env.DB.prepare("UPDATE usage_credits SET n = n - ?, updated_at = ? WHERE subject = ? AND k = ? AND n >= ? RETURNING n")
    .bind(n, nowIso(), subject, k, n).first();
  return !!r;
}
/**
 * Count `n` of `k` this month against the allowance `limit`, then the account's credits: { ok, used, limit, credits } — `used`
 * and `credits` as they are after it when ok, before it when refused. A null limit: nothing counted, always ok.
 */
export async function spend(env, user, k, n, limit) {
  if (limit === null || limit === undefined) return { ok: true, used: null, limit: null, credits: null };
  const subject = subjectOf(user);
  n = Math.max(0, Number(n) || 0);
  let used = 0, credits = 0;
  try {
    const [u, c] = await env.DB.batch([
      env.DB.prepare("SELECT n FROM usage_counters WHERE subject = ? AND k = ? AND period = ?").bind(subject, k, month()),
      env.DB.prepare("SELECT n FROM usage_credits WHERE subject = ? AND k = ?").bind(subject, k),
    ]);
    used = Number(u.results?.[0]?.n) || 0; credits = Number(c.results?.[0]?.n) || 0;
  } catch (e) { if (notReady(e)) return { ok: true, used: null, limit, credits: null }; throw e; }
  if (!n) return { ok: true, used, limit, credits };
  const beyond = Math.max(0, used + n - Math.max(limit, used));     // what the allowance left does not cover
  if (beyond > credits + 1e-9) return { ok: false, used, limit, credits };
  if (beyond > 0 && !(await useCredits(env, subject, k, beyond))) return { ok: false, used, limit, credits };
  await addUsage(env, subject, k, n);
  return { ok: true, used: used + n, limit, credits: credits - beyond };
}

/** Would `n` more of `k` fit this month (the allowance `limit`, then the credits)? Read only: { ok, used, limit, credits } —
 *  asked before a daily count is taken, so that a refusal for the month's allowance does not use up a request of the day. */
export async function fits(env, user, k, n, limit) {
  const s = await spend(env, user, k, 0, limit);
  if (s.used === null) return s;
  const beyond = Math.max(0, s.used + Math.max(0, Number(n) || 0) - Math.max(limit, s.used));
  return { ...s, ok: beyond <= s.credits + 1e-9 };
}

// ---- the funnel (counts by day, no account) -----------------------------------------------------------------------------------
export async function funnel(env, step, k = "") {
  try {
    await env.DB.prepare(`INSERT INTO billing_funnel (day, step, k, n) VALUES (?, ?, ?, 1)
      ON CONFLICT (day, step, k) DO UPDATE SET n = n + 1`).bind(today(), String(step).slice(0, 20), String(k || "").slice(0, 40)).run();
  } catch (e) { /* a count lost */ }
}

// ---- a refusal for a plan reason ------------------------------------------------------------------------------------------------
/** The cheapest plan whose value in the pack allows more than « free » for this capability ("plus" | "club"), from the pack
 *  this isolate last resolved (else « launch »). */
export function needOf(cap) {
  const v = (PACK || resolvePack(DEFAULTS.pack)).caps[cap];
  if (!v) return "plus";
  if (CAPS[cap].scope !== "user") return "club";
  if (better(cap, v.plus, v.free)) return "plus";
  return better(cap, v.member, v.free) || better(cap, v.participant, v.free) ? "club" : "plus";
}
/** 402 { error: "plan", cap, need, … } */
export const refusal = (cap, extra = {}) => json({ error: "plan", cap, need: needOf(cap), ...extra }, 402);
