// The plans' test (docs/billing/design.md §11): functions/_lib/plans.js on an in-memory D1 stand-in (node:sqlite, the real
// migration 0034 and the few tables of the earlier migrations it reads). Run: node tools/billing/t_plans.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MODULE = pathToFileURL(path.join(ROOT, "functions/_lib/plans.js")).href;

/** env.DB over node:sqlite: prepare().bind().first() / all() / run(), batch(). */
function d1(db) {
  let reads = 0;
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a.map((x) => (x === undefined ? null : typeof x === "boolean" ? Number(x) : x))),
    async all() { reads++; return { results: db.prepare(sql).all(...args) }; },
    async first() { reads++; return db.prepare(sql).all(...args)[0] || null; },
    async run() { reads++; db.prepare(sql).run(...args); return { success: true }; },
  });
  return { prepare: (sql) => stmt(sql), async batch(list) { reads -= list.length - 1; const out = []; for (const s of list) out.push(await s.all()); return out; },
    get reads() { return reads; }, zero() { reads = 0; } };
}
const EARLIER = `
  CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, email_verified INTEGER, licence TEXT, preview TEXT, birth_year INTEGER);
  CREATE TABLE user_countries (user_id INTEGER, country TEXT, status TEXT);
  CREATE TABLE orgs (id INTEGER PRIMARY KEY, cc TEXT, kind TEXT, code TEXT, name TEXT, parent INTEGER, state TEXT, source TEXT, created_at TEXT, claimed_at TEXT);
  CREATE TABLE org_members (org_id INTEGER, user_id INTEGER, roles TEXT, state TEXT, until TEXT);
  CREATE TABLE events (id TEXT PRIMARY KEY, org_id INTEGER, club TEXT, country TEXT, created_by INTEGER, analysis TEXT, race_key TEXT, status TEXT);`;
function world({ migrated = true } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(EARLIER);
  if (migrated) db.exec(readFileSync(path.join(ROOT, "migrations/0034_billing.sql"), "utf8"));
  // a league (1) > a committee (2) > club A (3); club B (4) alone; a Spanish club (5)
  db.exec(`INSERT INTO orgs (id, cc, kind, code, name, parent, state) VALUES (1, 'FR', 'league', 'AR', 'Ligue AR', NULL, 'claimed'), (2, 'FR', 'committee', '69', 'CDCO 69', 1, 'claimed'),
    (3, 'FR', 'club', '6901', 'Club A', 2, 'claimed'), (4, 'FR', 'club', '7701', 'Club B', NULL, 'claimed'), (5, 'ES', 'club', '', 'Club E', NULL, 'claimed');
    INSERT INTO org_members VALUES (3, 10, '', 'ok', NULL), (4, 11, '', 'ok', NULL), (5, 12, '', 'ok', NULL), (3, 13, '', 'ok', '2000-01-01'), (3, 14, '', 'ok', NULL);
    INSERT INTO user_countries VALUES (12, 'ES', 'ok'), (10, 'FR', 'ok');
    INSERT INTO events VALUES ('ev1', 3, '6901 - Club A', 'FR', 10, 'an1', 'a55', 'active'), ('ev2', 4, '7701 - Club B', 'FR', 11, NULL, NULL, 'active');`);
  const DB = d1(db);
  return { db, env: { DB, ADMIN_EMAILS: "admin@x.test", BILLING: "off",
    // the site's files: user 14's licence is a junior's (its latest race in D18)
    ASSETS: { fetch: async (u) => new Response(JSON.stringify(String(u).includes("/r/1400.json") ? { 14000: [[1, 2, 3, 4, "2026-05-01", "For", "", "", "D18", "6901AR"], [1, 2, 3, 4, "2020-05-01", "For", "", "", "D12", "6901AR"]] } : {})) } } };
}
const U = (id, more = {}) => ({ id, email: `u${id}@x.test`, email_verified: 1, licence: "", preview: "", ...more });

let n = 0, bad = 0;
const eq = (a, b, what) => { n++; if (JSON.stringify(a) !== JSON.stringify(b)) { bad++; console.log(`FAIL ${what}\n   got      ${JSON.stringify(a)}\n   expected ${JSON.stringify(b)}`); } };
const ok = (v, what) => eq(!!v, true, what);
let inst = 0;
const fresh = () => import(`${MODULE}?t=${++inst}`);      // a new copy of the module: its isolate's caches empty

// ---- before the migration ------------------------------------------------------------------------------------------------
{
  const P = await fresh(), { env } = world({ migrated: false });
  eq(await P.ready(env), false, "before: not ready");
  const e = await P.entitlementsOf(env, U(10, { licence: "123" }));
  eq(e.plan, "free", "before: free");
  eq([e.caps.mymapsMB, e.caps.lidarPerDay, e.caps.townPerDay, e.caps.genKm2Month, e.caps.aiPerDay, e.caps.cartoVersions, e.caps.orgmapsMB, e.caps.aiStrong, e.caps.routeVariants, e.caps.chronoCompetition],
    [1024, 5, 3, null, 15, 60, 3072, false, true, true], "before: today's values");
  eq((await P.packOf(env)).base, "launch", "before: launch");
  eq((await P.config(env, "prices")).plus.year, 2900, "before: default prices");
  eq(await P.subjectPlan(env, "u10"), null, "before: no plan");
  eq((await P.orgPlan(env, 3)).plan, null, "before: no org plan");
  eq(await P.openedBy(env, { org: 3, event: "ev1" }), null, "before: nothing opened");
  eq(await P.grantsOf(env, "u10"), [], "before: no grants");
  eq(await P.usageOf(env, "u10", "genKm2"), 0, "before: no usage");
  eq((await P.spend(env, U(10), "genKm2", 3, 10)).ok, true, "before: spend lets through");
  eq((await P.spend(env, U(10), "genKm2", 3, null)).ok, true, "before: no monthly count");
  await P.funnel(env, "sheet", "x");
  eq(await P.capOf(env, null, "orgmapsMB", { org: 3 }), 3072, "before: org cap");
  const a = await P.entCaps(env, U(10));
  eq(Object.keys(a), ["ent"], "before: ent only");
  eq(P.notReady(new Error("D1_ERROR: no such table: grants")), true, "notReady");
}

// ---- the switch -------------------------------------------------------------------------------------------------------------
{
  const P = await fresh();
  eq([P.billingMode({}), P.billingMode({ BILLING: "test" }), P.billingMode({ BILLING: "live" }), P.billingMode({ BILLING: "x" })], ["off", "test", "live", "off"], "modes");
  const admin = U(1, { email: "admin@x.test" }), prev = U(2, { preview: "track,billing" }), other = U(3);
  eq([admin, prev, other, null].map((u) => P.billingOn({ BILLING: "off", ADMIN_EMAILS: "admin@x.test" }, u)), [false, false, false, false], "off: nobody");
  eq([admin, prev, other, null].map((u) => P.billingOn({ BILLING: "test", ADMIN_EMAILS: "admin@x.test" }, u)), [true, true, false, false], "test: admins and previewers");
  eq([other, null].map((u) => P.billingOn({ BILLING: "live" }, u)), [true, true], "live: everyone");
}

// ---- the packs and the config ------------------------------------------------------------------------------------------------
{
  const P = await fresh(), { env } = world();
  eq(await P.ready(env), true, "ready");
  eq(Object.keys(P.CAPS).length, 14, "14 capabilities");
  for (const [k, c] of Object.entries(P.CAPS)) ok(["flag", "limit"].includes(c.kind) && c.module && ["user", "org", "event"].includes(c.scope) && "unit" in c, `cap ${k} described`);
  const L = P.resolvePack({ base: "launch" }).caps, V = P.resolvePack({ base: "v1" }).caps;
  for (const [k, c] of Object.entries(P.CAPS)) if (c.kind === "flag") eq(L[k].free, k !== "aiStrong", `launch: flag ${k}`);
  eq([L.mymapsMB.free, L.lidarPerDay.free, L.townPerDay.free, L.genKm2Month.free, L.aiPerDay.free, L.cartoVersions.free, L.orgmapsMB.free], [1024, 5, 3, null, 15, 60, 3072], "launch: limits");
  eq([L.mymapsMB.plus, L.mymapsMB.member, L.mymapsMB.participant], [1024, undefined, undefined], "launch: plus as free, nothing for members");
  eq([V.mymapsMB.plus, V.lidarPerDay.plus, V.townPerDay.plus, V.genKm2Month.free, V.genKm2Month.plus, V.aiPerDay.plus, V.aiStrong.plus, V.cartoVersions.plus, V.pixelOwnMap.plus],
    [25600, 20, 10, 10, 60, 100, true, null, true], "v1: plus");
  eq([V.mymapsMB.free, V.lidarPerDay.free, V.townPerDay.free, V.aiPerDay.free, V.cartoVersions.free], [1024, 5, 3, 15, 60], "v1: free's limits as today");
  for (const k of ["routesOwnSpeeds", "routeVariants", "headcamVideo", "analysisExport"]) eq([V[k].free, V[k].plus, V[k].participant, V[k].u21], [false, true, true, true], `v1: ${k}`);
  eq([V.chronoCompetition.free, V.chronoCompetition.club, V.orgmapsMB.free, V.orgmapsMB.club], [false, true, 3072, 20480], "v1: club");
  eq(V.mymapsMB.u21, 25600, "v1: u21 the whole of plus");

  // the stored pack over the base; prices deep-merged
  eq((await P.packOf(env)).base, "launch", "no row: launch");
  await P.setConfig(env, "pack", { base: "v1", set: { aiPerDay: { plus: 250 }, mymapsMB: { member: 5000 }, headcamVideo: { free: true } } }, 1);
  const pk = await P.packOf(env);
  eq([pk.base, pk.caps.aiPerDay.plus, pk.caps.aiPerDay.u21, pk.caps.mymapsMB.member, pk.caps.headcamVideo.free, pk.caps.lidarPerDay.plus], ["v1", 250, 250, 5000, true, 20], "pack override");
  await P.setConfig(env, "prices", { plus: { year: 3500, stripe: { year: "price_x" } }, trialDays: 14 }, 1);
  const pr = await P.config(env, "prices");
  eq([pr.plus.year, pr.plus.founder, pr.plus.stripe.year, pr.plus.stripe.founder, pr.trialDays, pr.club.year, pr.currency], [3500, 1900, "price_x", "", 14, 12000, "eur"], "prices merged over the defaults");
  eq((await P.config(env, "seller")).vat, 0, "seller default");
  eq((await P.config(env, "sell")).individuals, "none", "sell default");
  eq(P.DEFAULTS.prices.plus.year, 2900, "defaults untouched");
  eq(P.needOf("aiStrong"), "plus", "need: plus"); eq(P.needOf("chronoCompetition"), "club", "need: club");
  const r = P.refusal("aiStrong", { x: 1 });
  eq([r.status, await r.json()], [402, { error: "plan", cap: "aiStrong", need: "plus", x: 1 }], "refusal");
}

// ---- the four scopes, pack v1 -------------------------------------------------------------------------------------------------
{
  const P = await fresh(), { env, db } = world();
  await P.setConfig(env, "pack", { base: "v1", set: { mymapsMB: { member: 2048 }, aiPerDay: { member: 30, u21: 80 } } }, 1);
  const far = "2099-12-31";
  const ent = (u, ctx) => { P.changed(); return P.entitlementsOf(env, u, ctx); };
  const u10 = U(10, { licence: "100" }), u11 = U(11), u12 = U(12), u13 = U(13), u14 = U(14, { licence: "14000" });

  // nobody holds anything: the free values at the cost of one read
  P.changed(); env.DB.zero();
  let e = await P.entitlementsOf(env, u10);
  eq([e.plan, e.caps.mymapsMB, e.caps.routeVariants, e.caps.genKm2Month, e.why, e.trial], ["free", 1024, false, 10, {}, null], "v1 free");
  ok(env.DB.reads <= 1, `nothing anywhere: one read (${env.DB.reads})`);
  env.DB.zero(); await P.entitlementsOf(env, u10); await P.openedBy(env, { org: 3, event: "ev1" }); await P.orgPlan(env, 3);
  eq(env.DB.reads, 0, "then none for a while");

  // 1. the person: a trial grant
  const g1 = await P.addGrant(env, { subject: "u10", plan: "plus", until: far, reason: "trial", by: 1 });
  e = await ent(u10);
  eq([e.plan, e.caps.mymapsMB, e.caps.aiStrong, e.caps.cartoVersions, e.caps.routeVariants, e.caps.genKm2Month, e.trial], ["plus", 25600, true, null, true, 60, { until: far }], "person: grant");
  eq(e.why.mymapsMB, { scope: "person", plan: "plus", name: "", until: far }, "person: why");
  eq(e.caps.orgmapsMB, 3072, "person: org caps untouched");
  eq((await P.subjectPlan(env, "u10")).why, { kind: "grant", reason: "trial", id: g1 }, "subjectPlan: grant");
  eq((await ent(u11)).plan, "free", "another account: free");
  // ended, or past its day
  await P.endGrant(env, g1);
  eq((await ent(u10)).plan, "free", "grant ended");
  eq((await P.grantsOf(env, "u10")).map((g) => g.live), [false], "grantsOf: ended");
  await P.addGrant(env, { subject: "u10", plan: "plus", until: "2020-01-01", reason: "gift" });
  eq((await ent(u10)).plan, "free", "grant past its day");
  const gToday = await P.addGrant(env, { subject: "u10", plan: "plus", until: P.today(), reason: "gift" });
  eq((await ent(u10)).plan, "plus", "grant on its last day");
  await P.endGrant(env, gToday);
  // a subscription: active, past_due within its period, cancelled
  const sub = (subject, plan, status, end) => db.prepare(`INSERT OR REPLACE INTO subscriptions (subject, plan, status, current_end, stripe_sub, updated_at) VALUES (?, ?, ?, ?, ?, 'x')`).run(subject, plan, status, end, `sub_${subject}`);
  sub("u10", "plus", "active", "2099-06-01T00:00:00Z");
  e = await ent(u10);
  eq([e.plan, e.trial, e.why.aiPerDay.until], ["plus", null, "2099-06-01"], "subscription");
  eq((await P.subjectPlan(env, "u10")).why.kind, "sub", "subjectPlan: sub");
  sub("u10", "plus", "past_due", "2099-06-01T00:00:00Z"); eq((await ent(u10)).plan, "plus", "past_due within its period");
  sub("u10", "plus", "past_due", "2020-06-01T00:00:00Z"); eq((await ent(u10)).plan, "free", "past_due after its period");
  sub("u10", "plus", "canceled", "2099-06-01T00:00:00Z"); eq((await ent(u10)).plan, "free", "cancelled");
  db.exec("DELETE FROM subscriptions");
  try { await P.addGrant(env, { subject: "x1", plan: "plus", reason: "gift" }); ok(false, "bad grant refused"); } catch (err) { ok(true, "bad grant refused"); }

  // 2. the clubs: club A (3) on a plan — its members get the « member » column, its junior « u21 », a guest past its end nothing
  const gA = await P.addGrant(env, { subject: "o3", plan: "club", until: far, reason: "trust" });
  e = await ent(u10);
  eq([e.plan, e.caps.mymapsMB, e.caps.aiPerDay, e.caps.aiStrong, e.caps.routeVariants, e.caps.orgmapsMB, e.caps.chronoCompetition], ["free", 2048, 30, false, false, 20480, true], "club: member values");
  eq(e.why.mymapsMB, { scope: "club", plan: "club", name: "Club A", until: far }, "club: why");
  eq((await ent(u11)).caps.mymapsMB, 1024, "club: another club's member");
  eq((await ent(u13)).caps.mymapsMB, 1024, "club: a guest past its end");
  e = await ent(u14);
  eq([e.caps.mymapsMB, e.caps.aiPerDay, e.caps.aiStrong, e.caps.routeVariants, e.why.aiStrong.plan], [25600, 80, true, true, "u21"], "club: under 21 (licence category)");
  eq((await ent(U(15, { birth_year: Number(P.today().slice(0, 4)) - 30 }))).caps.aiStrong, false, "not a member: nothing");
  eq(await P.orgPlan(env, 3), { plan: "club", until: far, why: { kind: "grant", reason: "trust", id: gA, scope: "club" }, name: "Club A" }, "orgPlan");
  eq((await P.orgPlan(env, 4)).plan, null, "orgPlan: none");
  eq([await P.capOf(env, null, "orgmapsMB", { org: 3 }), await P.capOf(env, null, "orgmapsMB", { org: 4 }), await P.capOf(env, u11, "chronoCompetition", { org: 4 })], [20480, 3072, false], "capOf: org caps");

  // 4. the context: club A's events and analyses open the analysis flags to everyone, visitors too
  e = await ent(u11, { org: 3 });
  eq([e.caps.routeVariants, e.caps.headcamVideo, e.caps.mymapsMB, e.caps.aiStrong, e.why.routeVariants.scope, e.why.routeVariants.name], [true, true, 1024, false, "event", "Club A"], "context: participant");
  eq((await ent(null, { org: 3 })).caps.analysisExport, true, "context: a visitor");
  eq((await ent(u11, { org: 4 })).caps.routeVariants, false, "context: a club without a plan");
  P.changed();
  eq(await P.openedBy(env, { org: 3 }), { caps: ["routesOwnSpeeds", "routeVariants", "headcamVideo", "analysisExport", "chronoCompetition"], by: "Club A" }, "openedBy");
  eq(await P.openedBy(env, { org: 4 }), null, "openedBy: nothing");
  eq((await P.openedForEvent(env, null, { id: "ev1", org_id: 3 }))?.by, "Club A", "openedForEvent");
  eq((await P.openedForAnalysis(env, null, { id: "an1" }))?.by, "Club A", "openedForAnalysis: its event");
  eq(await P.openedForAnalysis(env, null, { id: "zz" }), null, "openedForAnalysis: none");
  eq((await P.openedForAnalysis(env, null, { id: "zz", orgClub: "6901" }))?.by, "Club A", "openedForAnalysis: a competition's organising club");
  eq((await P.openedForAnalysis(env, null, { id: "zz", orgClub: "", club: "6901" }))?.by, "Club A", "openedForAnalysis: a training's creator's club");
  eq(await P.openedForAnalysis(env, null, { id: "zz", club: "7701" }), null, "openedForAnalysis: a club without a plan");
  // an event bought by the unit
  const gE = await P.addGrant(env, { subject: "eev2", plan: "club", until: far, reason: "event" });
  eq((await ent(u12, { event: "ev2" })).caps.routeVariants, true, "event grant: participants");
  eq(await P.capOf(env, u11, "chronoCompetition", { event: "ev2" }), true, "event grant: the club's own");
  eq((await P.openedBy(env, { org: 4, event: "ev2" }))?.caps.includes("chronoCompetition"), true, "event grant: opened");
  await P.endGrant(env, gE); await P.endGrant(env, gA);
  eq((await ent(u10)).caps.mymapsMB, 1024, "club grant ended");

  // 3. the federation: fed-clubs gives the clubs « club », fed-all also the licensees « plus »
  const gF = await P.addGrant(env, { subject: "fFR", plan: "fed-clubs", until: far, reason: "agreement" });
  eq([(await P.orgPlan(env, 3)).plan, (await P.orgPlan(env, 4)).plan, (await P.orgPlan(env, 5)).plan], ["club", "club", null], "fed-clubs: France's clubs");
  eq((await P.orgPlan(env, 3)).why.scope, "federation", "fed-clubs: why");
  e = await ent(u10);
  eq([e.plan, e.caps.mymapsMB, e.caps.aiStrong, e.why.mymapsMB.scope], ["free", 2048, false, "federation"], "fed-clubs: members get the member values");
  eq((await ent(u12)).caps.mymapsMB, 1024, "fed-clubs: another country");
  await P.endGrant(env, gF);
  const gF2 = await P.addGrant(env, { subject: "fFR", plan: "fed-all", until: far, reason: "agreement" });
  e = await ent(u10);
  eq([e.plan, e.caps.mymapsMB, e.caps.aiStrong], ["plus", 25600, true], "fed-all: a licensee has plus");
  eq((await ent(U(20, { licence: "555" }))).plan, "plus", "fed-all: a licensee without a club row");
  eq((await ent(u12)).plan, "free", "fed-all: another country");
  await P.endGrant(env, gF2);
  // a league: the clubs under it, two levels down
  const gL = await P.addGrant(env, { subject: "fo1", plan: "fed-all", until: far, reason: "agreement" });
  eq([(await P.orgPlan(env, 3)).plan, (await P.orgPlan(env, 3)).name, (await P.orgPlan(env, 4)).plan], ["club", "Ligue AR", null], "league: its clubs");
  eq([(await ent(u10)).plan, (await ent(u11)).plan], ["plus", "free"], "league fed-all: its clubs' members");
  await P.endGrant(env, gL);

  // combined: the most generous of each, null over any number
  await P.setConfig(env, "pack", { base: "v1", set: { mymapsMB: { member: 50000 }, aiPerDay: { member: 30, participant: null }, lidarPerDay: { member: 2 } } }, 1);
  await P.addGrant(env, { subject: "u10", plan: "plus", until: far, reason: "gift" });
  await P.addGrant(env, { subject: "o3", plan: "club", until: null, reason: "pilot" });
  e = await ent(u10, { org: 3 });
  eq([e.plan, e.caps.mymapsMB, e.why.mymapsMB.scope, e.caps.lidarPerDay, e.why.lidarPerDay.scope, e.caps.aiPerDay, e.why.aiPerDay.scope, e.caps.cartoVersions],
    ["plus", 50000, "club", 20, "person", null, "event", null], "combined: the most generous wins");
  eq((await P.orgPlan(env, 3)).until, null, "a grant without an end");
  eq([P.better("mymapsMB", null, 5), P.better("mymapsMB", 5, null), P.better("mymapsMB", 6, 5), P.better("aiStrong", true, false), P.better("aiStrong", false, true), P.better("aiStrong", undefined, false)],
    [true, false, true, true, false, false], "better");

  // entCaps: `ent` always; billing, plan, trial only when on for the account
  eq(Object.keys(await P.entCaps(env, u10)), ["ent"], "entCaps: off");
  eq(Object.keys(await P.entCaps({ ...env, BILLING: "live" }, u10)), ["ent", "billing", "plan", "trial"], "entCaps: live");
  eq(Object.keys(await P.entCaps({ ...env, BILLING: "test" }, u10)), ["ent"], "entCaps: test, a regular account");
  eq((await P.entCaps({ ...env, BILLING: "test" }, U(1, { email: "admin@x.test" }))).billing, true, "entCaps: test, an administrator");

  // storage limits in bytes, the env override standing for the free value
  eq([await P.bytesOf(env, "mymapsMB", 1024, "12"), await P.bytesOf(env, "mymapsMB", 1024, undefined), await P.bytesOf(env, "mymapsMB", 25600, "12"), await P.bytesOf(env, "mymapsMB", null, "12")],
    [12 * 1048576, 1024 * 1048576, 25600 * 1048576, null], "bytesOf");
  eq([P.atLeast(5, 20), P.atLeast(50, 20), P.atLeast(null, 20)], [20, 50, null], "atLeast");
}

// ---- usage and credits (§7) ---------------------------------------------------------------------------------------------------
{
  const P = await fresh(), { env, db } = world();
  const u = U(10);
  eq(await P.spend(env, u, "genKm2", 4, null), { ok: true, used: null, limit: null, credits: null }, "spend: no monthly count");
  eq(await P.usageOf(env, "u10", "genKm2"), 0, "nothing counted");
  eq(await P.spend(env, u, "genKm2", 4, 10), { ok: true, used: 4, limit: 10, credits: 0 }, "spend: within the allowance");
  eq(await P.spend(env, u, "genKm2", 6, 10), { ok: true, used: 10, limit: 10, credits: 0 }, "spend: up to the allowance");
  eq(await P.spend(env, u, "genKm2", 1, 10), { ok: false, used: 10, limit: 10, credits: 0 }, "spend: beyond, no credit");
  eq([(await P.fits(env, u, "genKm2", 1, 10)).ok, (await P.fits(env, u, "genKm2", 0, 10)).ok, (await P.fits(env, u, "genKm2", 5, 20)).ok, (await P.fits(env, u, "genKm2", 5, null)).ok],
    [false, true, true, true], "fits: read only");
  eq(await P.usageOf(env, "u10", "genKm2"), 10, "fits: nothing counted");
  await P.addCredits(env, "u10", "genKm2", 5);
  eq(await P.spend(env, u, "genKm2", 2, 10), { ok: true, used: 12, limit: 10, credits: 3 }, "spend: credits after the allowance");
  eq(await P.spend(env, u, "genKm2", 4, 10), { ok: false, used: 12, limit: 10, credits: 3 }, "spend: not enough credits");
  eq([await P.usageOf(env, "u10", "genKm2"), await P.creditsOf(env, "u10", "genKm2")], [12, 3], "usage and credits kept");
  // part from the allowance, part from the credits
  await P.addCredits(env, "u11", "genKm2", 2);
  await P.addUsage(env, "u11", "genKm2", 9);
  eq(await P.spend(env, U(11), "genKm2", 3, 10), { ok: true, used: 12, limit: 10, credits: 0 }, "spend: both");
  eq([await P.useCredits(env, "u10", "genKm2", 3), await P.useCredits(env, "u10", "genKm2", 1), await P.creditsOf(env, "u10", "genKm2")], [true, false, 0], "useCredits");
  eq(await P.usageOf(env, "u10", "genKm2", "2020-01"), 0, "another month");
  await P.funnel(env, "sheet", "aiStrong"); await P.funnel(env, "sheet", "aiStrong"); await P.funnel(env, "pricing");
  eq(db.prepare("SELECT step, k, n FROM billing_funnel ORDER BY step").all().map((r) => [r.step, r.k, r.n]), [["pricing", "", 1], ["sheet", "aiStrong", 2]], "funnel");
  ok(/^\d{4}-\d{2}-\d{2}$/.test(P.today()), "today");
}

console.log(bad ? `${bad} of ${n} checks FAILED` : `plans: ${n} checks passed`);
process.exit(bad ? 1 : 0);
