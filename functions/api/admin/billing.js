// /api/admin/billing — the administrators' side of Ozimut's own plans (docs/billing/design.md §8; migration 0034).
// 404 { error: "off" } while wrangler.toml's BILLING is off (before anything else); administrators only (401 / 403);
// 503 { error: "not ready" } before the migration — except view=health, which says so. A bad body: 400 { error: "bad request",
// field? }. Amounts are integers in cents; days « YYYY-MM-DD ». Never a secret's value: `health` gives names and booleans.
//
// GET ?view=
//   summary    -> { mode, subs: [{ plan, status, source, n, amount }], arr (cents: the active subscriptions' yearly amounts),
//                   pastDue: n, trials: { started, converted }, grants: [{ reason, plan, n }] (in force),
//                   invoices: [{ kind: invoice|credit, status, n, total }] (quotes left out), overdue: { n, total } (issued, past due),
//                   countries: [{ country, n }] (billing_customers: the buyers' countries, for the VAT thresholds),
//                   funnel: [{ day, step, k, n }] (30 days), failedEvents: n (Stripe events not applied) }
//                   (one D1 batch)
//   subs       -> { subs: [{ subject, name, plan, status, source, period, current_start, current_end, cancel_at_end, amount, currency,
//                            first_paid_at, ended_at, invoice_id, stripe_sub, updated_at }] }                (500 at most, the latest first)
//   grants     [&all=1 the ended ones too] [&subject=]
//              -> { grants: [{ id, subject, name, plan, until, reason, note, by_user, created_at, ended_at, live }], reasons, plans }
//   agreements -> { agreements: [same rows as grants, subject « f<CC> » or « fo<org id> »], invoices: [brief] (those of these subjects) }
//   invoices   [&status=issued|paid|cancelled|draft] [&kind=invoice|credit|quote] [&org=<id>]
//              -> { invoices: [brief + { org: "<org name>" }] }                                              (300 at most)
//   invoice&id=<n> -> { invoice: record }     (as /api/billing/org/<id>/invoice/<n>: lines, seller, buyer parsed); 404 { error: "not found" }
//   codes      -> { codes: [{ hash, plan, days, max_uses, uses, expires, reason, note, created_at, ended_at, live }] }
//   events     -> { events: [{ event_id, type, at, ok, note, ref }] }                                       (100, failures first)
//   config     -> { mode, columns: [free, plus, club, member, participant, u21], bases: [launch, v1], plans: [ids],
//                   pack: { base, set, rows: [{ key, kind: flag|limit, unit, module, scope, values: { <column>: value },
//                           set: { <column>: value } (the overrides stored), launch: { … }, v1: { … } }] },
//                   prices, seller, sell, texts, changes }
//   health     -> { mode, migration: bool, secrets: { STRIPE_SECRET_KEY: bool, STRIPE_WEBHOOK_SECRET: bool }, stripeApiOverride: bool,
//                   stripePrices: { "plus.year": bool, "plus.founder": bool, "mapPack": bool },
//                   seller: { complete: bool, missing: [field names], iban: bool }, sell: "none"|"fr"|"eu"|"all", pack: "launch"|"v1",
//                   mail: bool }
//   brief / record: see functions/api/billing/org/[[path]].js.
//
// POST { op, … }
//   config.pack     { base?: "launch"|"v1", cell?: { cap, column, value } | { cap, column, reset: true }, set?: { <cap>: { <column>: value } } }
//                   (a flag: boolean; a limit: a non-negative number or null = no limit) -> { ok, pack: { base, set } }
//   config.prices   { prices: { plus: { year, founder, founderUntil, stripe: { year, founder } }, club: { year, small, smallMax },
//                     fed: { clubs, all }, event: { perEntry, cap }, mapPack: { km2, amount, stripe }, trialDays, currency } }
//                   (any part may be left out: merged over what is stored) -> { ok, prices }
//   config.seller   { seller: { name, form, capital, address, country, siren, siret, rcs, vat (a rate in %), vatNote, iban, bic, email,
//                     mediator, mediatorUrl } } -> { ok, seller }
//   config.sell     { sell: { individuals: "none"|"fr"|"eu"|"all", mor: { on, countries: [CC], params: {} } } } -> { ok, sell }
//   config.texts    { texts: { … } } (free JSON, 20 000 characters) -> { ok, texts }
//   config.changes  { changes: [{ date: "YYYY-MM-DD", … strings or { fr, en, de, es } }] } (200 entries) -> { ok, changes }
//   grant.add       { subject: u<id>|o<id>|e<id>|f<CC>|fo<id>, plan: plus|club|fed-clubs|fed-all, until: day|null, reason, note? } -> { ok, id }
//                   (400 field "until" | "reason" | "grant": a bad subject or plan)
//   grant.end       { id } -> { ok }                          404 { error: "not found" }
//   agreement.add   { cc: "FR" | org: <id of a league, a committee or a federation — not a club>, plan: "fed-clubs"|"fed-all",
//                     until: day|null, note?, mail?: bool (to the org's managers and treasurers — the invoiced org's when cc),
//                     invoice?: { org: <id, the org invoiced>, lines: [{ label, qty?, unit (cents) }], note? } }
//                   -> { ok, id, subject: "f<CC>"|"fo<id>", invoice?: record, invoiceError?: "seller"|"billing"|"lines", mailed: n }
//                   (400 field "plan" | "until" | "org" | "cc" | "invoice.org" | "invoice.lines"; the grant stands when the invoice fails)
//   agreement.end   { id } -> { ok }                          404 { error: "not found" } (no grant of a subject « f… »)
//   invoice.issue   { org: <id>, lines: [{ label, qty?, unit (cents), amount? }], plan?: "club", periodFrom?, periodTo?, note?,
//                     trust?: bool (with a plan: it starts at once on trust, 30 days), mail?: bool }
//                   -> { ok, invoice: record, mailed: n }      400 { error: "seller" | "billing" | "lines" | "period" }
//   invoice.paid    { id, how?: "transfer", at?: day, mail?: bool (default true) } -> { ok, invoice: record, mailed: n }
//   invoice.unpaid  { id } -> { ok, invoice: record }
//   invoice.credit  { id, note? } -> { ok, credit: record, invoice: record }
//   invoice.event   { event: "<event id>", mail?: bool } « Facturer » an event bought by the unit, on or after its day:
//                   one line, min(entries entered × prices.event.perEntry, prices.event.cap), to the event's club
//                   -> { ok, invoice: record (subject « e<event id> »), mailed: n }
//                      400 { error: "early", date } (the event is still to come) | { error: "not found"|"not bought"|"org"|"nothing"|"seller"|"billing" }
//                      409 { error: "exists", invoice: brief }
//                   (invoice.paid / unpaid / credit: 404 { error: "not found" }, 409 { error: "state" })
//   code.make       { plan?: "plus" (the only one: codes are redeemed by a person, POST /api/billing/code), days: 1-3660,
//                     maxUses?: 1-100000 (default 1), expires?: day, reason?: gift|founder|pilot|staff (default gift), note? }
//                   -> { ok, code: "K7MQ-2XWD-9HRT" (shown this once, never stored), hash }
//                   Stored: sha256hex(code.trim().toUpperCase().replace(/[-\s]/g, "")) — POST /api/billing/code's normCode: the code
//                   may be typed with or without its dashes, in any case.
//   code.end        { hash } -> { ok }                         404 { error: "not found" } (unknown or already ended)
//   event.replay    { id: "evt_…" } -> { ok: bool, note }     (ok false with a note when Stripe is not configured or does not know it)
//   check           -> { ok: true, ran, repaired: [..], closed, trialNotices, renewalNotices, invoiceReminders: n }
//                   (_lib/billing.js billingDaily run now, whatever ran today; it also reminds the clubs' invoices past due, once each)

import { json, nowIso, readBody, withUser } from "../../_lib/api.js";
import { billingDaily, replay, sendBilling } from "../../_lib/billing.js";
import { randomBytes, sha256hex } from "../../_lib/crypto.js";
import {
  TRUST_DAYS, addDays, brief, cleanLines, creditNote, invoiceById, invoiceEvent, issue, markPaid, markUnpaid, officersOf, parsed, sellerComplete,
} from "../../_lib/invoices.js";
import { orgById, orgOfEvent } from "../../_lib/orgs.js";
import {
  CAPS, COLUMNS, PACKS, PLANS, REASONS, addGrant, billingMode, changed, config, endGrant, notReady, ready, resolvePack, setConfig, today,
} from "../../_lib/plans.js";
import { agreementMail, clubInvoiceMail, clubPaidMail } from "../../_lib/templates.js";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s) => typeof s === "string" && DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const bad = (field) => json({ error: "bad request", ...(field ? { field } : {}) }, 400);
const plain = (v) => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max) : null);
const cents = (v, max = 1e9) => (Number.isInteger(v) && v >= 0 && v <= max ? v : null);
const PRICE_ID = /^price_[A-Za-z0-9]+$/;
const priceId = (v) => (v === "" || (typeof v === "string" && PRICE_ID.test(v) && v.length <= 120) ? v : null);

/** A code's stored form: the SHA-256 (hex) of the code trimmed, upper-cased, without dashes or spaces — exactly what POST
 *  /api/billing/code hashes (functions/api/billing/[[path]].js normCode): typed with or without the dashes, in any case. */
const codeHash = (code) => sha256hex(String(code || "").trim().toUpperCase().replace(/[-\s]/g, ""));
const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";          // no 0 / O / 1 / I; 32 letters, so x % 32 is even
function newCode() {
  const s = Array.from(randomBytes(12), (x) => CODE_ABC[x % 32]).join("");
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

const send = (env, to, mail) => sendBilling(env, to, mail);
/** One e-mail to each manager and treasurer of an org; -> how many. */
async function mailOfficers(env, orgId, mailOf) {
  let n = 0;
  if (!orgId) return n;
  for (const u of await officersOf(env, orgId)) { try { await send(env, u.email, mailOf(u)); n += 1; } catch (e) { /* the action stands */ } }
  return n;
}

/** The names behind subjects: Map(subject -> name). */
async function namesOf(env, subjects) {
  const out = new Map(), ids = { u: new Set(), o: new Set(), e: new Set() };
  for (const s of new Set(subjects)) {
    let m;
    if ((m = /^u(\d+)$/.exec(s))) ids.u.add(Number(m[1]));
    else if ((m = /^f?o(\d+)$/.exec(s))) ids.o.add(Number(m[1]));
    else if ((m = /^f([A-Z]{2})$/.exec(s))) out.set(s, m[1]);
    else if ((m = /^e(.+)$/.exec(s))) ids.e.add(m[1]);
  }
  // (D1 takes 100 bound values a statement: 90 a statement, all in one batch)
  const q = async (table, col, set) => {
    const all = [...set], st = [];
    for (let i = 0; i < all.length; i += 90) {
      const list = all.slice(i, i + 90);
      st.push(env.DB.prepare(`SELECT id, ${col} AS name FROM ${table} WHERE id IN (${list.map(() => "?").join(",")})`).bind(...list));
    }
    if (!st.length) return [];
    try { return (await env.DB.batch(st)).flatMap((r) => r.results || []); } catch (e) { return []; }
  };
  const [us, os, es] = [await q("users", "COALESCE(NULLIF(display_name, ''), NULLIF(trim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), ''), email)", ids.u), await q("orgs", "name", ids.o), await q("events", "name", ids.e)];
  for (const r of us) out.set(`u${r.id}`, r.name || "");
  for (const r of os) { out.set(`o${r.id}`, r.name || ""); out.set(`fo${r.id}`, r.name || ""); }
  for (const r of es) out.set(`e${r.id}`, r.name || "");
  return out;
}

export async function onRequest(ctx) {
  if (billingMode(ctx.env) === "off") return json({ error: "off" }, 404);
  return gated(ctx);
}
const gated = withUser(async ({ request, env }, admin) => {
  const url = new URL(request.url), view = url.searchParams.get("view") || "summary";
  try {
    if (request.method === "GET") {
      if (view === "health") return json(await health(env));
      if (!(await ready(env))) return json({ error: "not ready" }, 503);
      const f = VIEWS[view];
      if (!f) return json({ error: "not found" }, 404);
      const r = await f(env, url.searchParams);
      return r instanceof Response ? r : json(r);
    }
    if (request.method === "POST") {
      if (!(await ready(env))) return json({ error: "not ready" }, 503);
      const b = await readBody(request);
      const f = b && typeof b.op === "string" ? OPS[b.op] : null;
      if (!f) return bad("op");
      const r = await f(env, b, admin, request);
      return r instanceof Response ? r : json(r);
    }
    return json({ error: "method not allowed" }, 405);
  } catch (e) { if (notReady(e)) return json({ error: "not ready" }, 503); throw e; }
}, { admin: true });

// ---- views ---------------------------------------------------------------------------------------------------------------
const liveGrant = (g, day) => !g.ended_at && (!g.until || g.until >= day);
const grantRow = (g, names, day) => ({ id: g.id, subject: g.subject, name: names.get(g.subject) || "", plan: g.plan, until: g.until || null, reason: g.reason,
  note: g.note || "", by_user: g.by_user ?? null, created_at: g.created_at, ended_at: g.ended_at || null, live: liveGrant(g, day) });

const VIEWS = {
  async summary(env) {
    const day = today();
    const [subs, trials, grants, inv, countries, funnel, evs] = await env.DB.batch([
      env.DB.prepare("SELECT plan, status, source, COUNT(*) AS n, COALESCE(SUM(amount), 0) AS amount FROM subscriptions WHERE ended_at IS NULL GROUP BY plan, status, source ORDER BY plan, status"),
      env.DB.prepare(`SELECT COUNT(DISTINCT g.subject) AS started, COUNT(DISTINCT CASE WHEN s.first_paid_at IS NOT NULL THEN g.subject END) AS converted
        FROM grants g LEFT JOIN subscriptions s ON s.subject = g.subject WHERE g.reason = 'trial'`),
      env.DB.prepare("SELECT reason, plan, COUNT(*) AS n FROM grants WHERE ended_at IS NULL AND (until IS NULL OR until >= ?) GROUP BY reason, plan ORDER BY reason, plan").bind(day),
      env.DB.prepare(`SELECT kind, status, COUNT(*) AS n, COALESCE(SUM(total), 0) AS total, SUM(status = 'issued' AND kind = 'invoice' AND due_at < ?) AS late,
        COALESCE(SUM(CASE WHEN status = 'issued' AND kind = 'invoice' AND due_at < ? THEN total ELSE 0 END), 0) AS late_total
        FROM invoices WHERE kind != 'quote' GROUP BY kind, status ORDER BY kind, status`).bind(day, day),
      env.DB.prepare("SELECT country, COUNT(*) AS n FROM billing_customers GROUP BY country ORDER BY n DESC"),
      env.DB.prepare("SELECT day, step, k, n FROM billing_funnel WHERE day >= ? ORDER BY day, step, k").bind(addDays(day, -30)),
      env.DB.prepare("SELECT COUNT(*) AS n FROM billing_events WHERE ok = 0"),
    ]);
    const s = subs.results || [], i = inv.results || [];
    return {
      mode: billingMode(env), subs: s, arr: s.filter((r) => r.status === "active").reduce((a, r) => a + (r.amount || 0), 0),
      pastDue: s.filter((r) => r.status === "past_due").reduce((a, r) => a + r.n, 0),
      trials: { started: trials.results?.[0]?.started || 0, converted: trials.results?.[0]?.converted || 0 },
      grants: grants.results || [], invoices: i.map((r) => ({ kind: r.kind, status: r.status, n: r.n, total: r.total })),
      overdue: { n: i.reduce((a, r) => a + (r.late || 0), 0), total: i.reduce((a, r) => a + (r.late_total || 0), 0) },
      countries: countries.results || [], funnel: funnel.results || [], failedEvents: evs.results?.[0]?.n || 0,
    };
  },
  async subs(env) {
    const { results } = await env.DB.prepare("SELECT * FROM subscriptions ORDER BY updated_at DESC LIMIT 500").all();
    const names = await namesOf(env, (results || []).map((r) => r.subject));
    return { subs: (results || []).map((r) => ({ subject: r.subject, name: names.get(r.subject) || "", plan: r.plan, status: r.status, source: r.source, period: r.period,
      current_start: r.current_start, current_end: r.current_end, cancel_at_end: !!r.cancel_at_end, amount: r.amount, currency: r.currency,
      first_paid_at: r.first_paid_at, ended_at: r.ended_at, invoice_id: r.invoice_id ?? null, stripe_sub: r.stripe_sub || null, updated_at: r.updated_at })) };
  },
  async grants(env, q) {
    const day = today(), subject = q.get("subject");
    const where = [q.get("all") === "1" ? "" : "ended_at IS NULL AND (until IS NULL OR until >= ?)", subject ? "subject = ?" : ""].filter(Boolean);
    const binds = [...(q.get("all") === "1" ? [] : [day]), ...(subject ? [subject] : [])];
    const { results } = await env.DB.prepare(`SELECT * FROM grants ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY id DESC LIMIT 500`).bind(...binds).all();
    const names = await namesOf(env, (results || []).map((r) => r.subject));
    return { grants: (results || []).map((g) => grantRow(g, names, day)), reasons: REASONS, plans: Object.keys(PLANS).filter((p) => p !== "free") };
  },
  async agreements(env) {
    const day = today();
    const [g, i] = await env.DB.batch([
      env.DB.prepare("SELECT * FROM grants WHERE subject LIKE 'f%' ORDER BY id DESC LIMIT 300"),
      env.DB.prepare("SELECT * FROM invoices WHERE subject LIKE 'f%' ORDER BY id DESC LIMIT 300"),
    ]);
    const names = await namesOf(env, (g.results || []).map((r) => r.subject));
    return { agreements: (g.results || []).map((x) => grantRow(x, names, day)), invoices: (i.results || []).map(brief) };
  },
  async invoices(env, q) {
    const where = [], binds = [];
    if (["issued", "paid", "cancelled", "draft"].includes(q.get("status"))) { where.push("i.status = ?"); binds.push(q.get("status")); }
    if (["invoice", "credit", "quote"].includes(q.get("kind"))) { where.push("i.kind = ?"); binds.push(q.get("kind")); }
    if (/^\d+$/.test(q.get("org") || "")) { where.push("i.org_id = ?"); binds.push(Number(q.get("org"))); }
    const { results } = await env.DB.prepare(`SELECT i.*, o.name AS org_name FROM invoices i LEFT JOIN orgs o ON o.id = i.org_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY i.id DESC LIMIT 300`).bind(...binds).all();
    return { invoices: (results || []).map((r) => ({ ...brief(r), org: r.org_name || "" })) };
  },
  async invoice(env, q) {
    const inv = await invoiceById(env, q.get("id"));
    return inv ? { invoice: parsed(inv) } : json({ error: "not found" }, 404);
  },
  async codes(env) {
    const day = today();
    const { results } = await env.DB.prepare("SELECT * FROM billing_codes ORDER BY created_at DESC LIMIT 500").all();
    return { codes: (results || []).map((c) => ({ hash: c.code_hash, plan: c.plan, days: c.days, max_uses: c.max_uses, uses: c.uses, expires: c.expires || null,
      reason: c.reason, note: c.note || "", created_at: c.created_at, ended_at: c.ended_at || null,
      live: !c.ended_at && c.uses < c.max_uses && (!c.expires || c.expires >= day) })) };
  },
  async events(env) {
    const { results } = await env.DB.prepare("SELECT event_id, type, at, ok, note, ref FROM billing_events ORDER BY ok ASC, at DESC LIMIT 100").all();
    return { events: (results || []).map((e) => ({ ...e, ok: !!e.ok })) };
  },
  async config(env) {
    changed();                                  // an administrator reads what is stored now, not this isolate's minute-old copy
    const stored = await config(env, "pack"), now = resolvePack(stored);
    const launch = resolvePack({ base: "launch", set: {} }), v1 = resolvePack({ base: "v1", set: {} });
    const rows = Object.entries(CAPS).map(([key, c]) => ({ key, kind: c.kind, unit: c.unit, module: c.module, scope: c.scope,
      values: view6(now.caps[key]), set: plain(stored?.set?.[key]) ? stored.set[key] : {}, launch: view6(launch.caps[key]), v1: view6(v1.caps[key]) }));
    return { mode: billingMode(env), columns: COLUMNS, bases: Object.keys(PACKS), plans: Object.keys(PLANS),
      pack: { base: now.base, set: plain(stored?.set) ? stored.set : {}, rows },
      prices: await config(env, "prices"), seller: await config(env, "seller"), sell: await config(env, "sell"),
      texts: await config(env, "texts"), changes: await config(env, "changes") };
  },
};
// a column that gives nothing (member, participant left out) is written null... which for a limit means « no limit »: so a
// column left out is simply absent from the object
const view6 = (o) => Object.fromEntries(COLUMNS.filter((c) => o[c] !== undefined).map((c) => [c, o[c]]));

async function health(env) {
  const migration = await ready(env);
  const [prices, seller, sell, pack] = [await config(env, "prices"), await config(env, "seller"), await config(env, "sell"), await config(env, "pack")];
  const need = ["name", "address"].filter((k) => !String(seller?.[k] || "").trim());
  if (!String(seller?.siren || "").trim() && !String(seller?.siret || "").trim()) need.push("siren");
  return {
    mode: billingMode(env), migration,
    secrets: { STRIPE_SECRET_KEY: !!env.STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET: !!env.STRIPE_WEBHOOK_SECRET },
    stripeApiOverride: !!env.STRIPE_API,
    stripePrices: { "plus.year": !!prices?.plus?.stripe?.year, "plus.founder": !!prices?.plus?.stripe?.founder, mapPack: !!prices?.mapPack?.stripe },
    seller: { complete: sellerComplete(seller), missing: need, iban: !!String(seller?.iban || "").trim() },
    sell: sell?.individuals || "none", pack: resolvePack(pack).base,
    mail: !!(env.RESEND_API_KEY || (env.SCW_SECRET_KEY && env.SCW_PROJECT_ID) || env.DEV_ECHO === "1"),
  };
}

// ---- the configuration's checks ----------------------------------------------------------------------------------------------
/** A pack cell's value: a flag a boolean; a limit a non-negative number or null. undefined when not acceptable. */
function cellValue(cap, v) {
  if (CAPS[cap].kind === "flag") return typeof v === "boolean" ? v : undefined;
  return v === null || (typeof v === "number" && Number.isFinite(v) && v >= 0) ? v : undefined;
}
function cleanSet(set) {
  if (!plain(set)) return null;
  const out = {};
  for (const [cap, cols] of Object.entries(set)) {
    if (!CAPS[cap] || !plain(cols)) return null;
    for (const [col, v] of Object.entries(cols)) {
      if (!COLUMNS.includes(col) || cellValue(cap, v) === undefined) return null;
      (out[cap] = out[cap] || {})[col] = v;
    }
  }
  return out;
}
/** prices merged over `base` and checked; null (with the field's name in `err.field`) when something is not acceptable. */
function cleanPrices(base, p, err) {
  if (!plain(p)) { err.field = "prices"; return null; }
  const out = JSON.parse(JSON.stringify(base));
  const take = (path, check) => {
    let src = p, dst = out;
    for (let i = 0; i < path.length - 1; i++) { src = plain(src) ? src[path[i]] : undefined; dst = dst[path[i]] = plain(dst[path[i]]) ? dst[path[i]] : {}; }
    const k = path[path.length - 1];
    if (!plain(src) || src[k] === undefined) return true;
    const v = check(src[k]);
    if (v === null || v === undefined) { err.field = `prices.${path.join(".")}`; return false; }
    dst[k] = v;
    return true;
  };
  const nullable = (f) => (v) => (v === null ? { v: null } : (f(v) === null ? null : { v: f(v) }));
  const ok = take(["plus", "year"], cents) && take(["plus", "founder"], cents) && take(["plus", "founderUntil"], (v) => (v === "" || isDay(v) ? v : null))
    && take(["plus", "stripe", "year"], priceId) && take(["plus", "stripe", "founder"], priceId)
    && take(["club", "year"], cents) && take(["club", "small"], cents) && take(["club", "smallMax"], (v) => cents(v, 1e6))
    && take(["fed", "clubs"], cents) && take(["fed", "all"], cents)
    && take(["event", "perEntry"], cents) && take(["event", "cap"], nullable(cents))
    && take(["mapPack", "km2"], (v) => (typeof v === "number" && v > 0 && v <= 1e5 ? v : null)) && take(["mapPack", "amount"], cents) && take(["mapPack", "stripe"], priceId)
    && take(["trialDays"], (v) => cents(v, 366)) && take(["currency"], (v) => (typeof v === "string" && /^[a-z]{3}$/.test(v) ? v : null));
  if (!ok) return null;
  if (plain(out.event?.cap)) out.event.cap = out.event.cap.v;       // the nullable wrapper
  return out;
}
const SELLER = { name: 200, form: 120, capital: 60, address: 500, country: 2, siren: 20, siret: 20, rcs: 120, vatNote: 300, iban: 42, bic: 14, email: 254,
  mediator: 300, mediatorUrl: 300 };
function cleanSeller(base, s, err) {
  if (!plain(s)) { err.field = "seller"; return null; }
  const out = { ...base };
  for (const [k, max] of Object.entries(SELLER)) {
    if (s[k] === undefined) continue;
    const v = str(s[k], max);
    if (v === null) { err.field = `seller.${k}`; return null; }
    out[k] = v;
  }
  if (s.vat !== undefined) {
    if (typeof s.vat !== "number" || !(s.vat >= 0 && s.vat <= 100)) { err.field = "seller.vat"; return null; }
    out.vat = s.vat;
  }
  out.country = String(out.country || "").toUpperCase();
  if (out.country && !/^[A-Z]{2}$/.test(out.country)) { err.field = "seller.country"; return null; }
  out.iban = String(out.iban || "").replace(/\s+/g, "").toUpperCase();
  out.bic = String(out.bic || "").replace(/\s+/g, "").toUpperCase();
  if (out.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(out.iban)) { err.field = "seller.iban"; return null; }
  if (out.mediatorUrl && !/^https:\/\//.test(out.mediatorUrl)) { err.field = "seller.mediatorUrl"; return null; }
  return out;
}
function cleanSell(base, s, err) {
  if (!plain(s)) { err.field = "sell"; return null; }
  const out = JSON.parse(JSON.stringify(base));
  if (s.individuals !== undefined) {
    if (!["none", "fr", "eu", "all"].includes(s.individuals)) { err.field = "sell.individuals"; return null; }
    out.individuals = s.individuals;
  }
  if (s.mor !== undefined) {
    const m = s.mor;
    if (!plain(m) || (m.on !== undefined && typeof m.on !== "boolean")
      || (m.countries !== undefined && !(Array.isArray(m.countries) && m.countries.length <= 250 && m.countries.every((c) => typeof c === "string" && /^[A-Z]{2}$/.test(c))))
      || (m.params !== undefined && !(plain(m.params) && JSON.stringify(m.params).length <= 4000))) { err.field = "sell.mor"; return null; }
    out.mor = { on: m.on ?? out.mor?.on ?? false, countries: m.countries ?? out.mor?.countries ?? [], params: m.params ?? out.mor?.params ?? {} };
  }
  return out;
}
const textish = (v) => typeof v === "string" || (plain(v) && Object.entries(v).every(([k, x]) => ["fr", "en", "de", "es"].includes(k) && typeof x === "string"));

// ---- actions ---------------------------------------------------------------------------------------------------------------
const OPS = {
  async "config.pack"(env, b, admin) {
    const stored = await config(env, "pack");
    const next = { base: PACKS[stored?.base] ? stored.base : "launch", set: cleanSet(stored?.set || {}) || {} };
    if (b.base !== undefined) { if (!PACKS[b.base]) return bad("base"); next.base = b.base; }
    if (b.set !== undefined) { const s = cleanSet(b.set); if (!s) return bad("set"); next.set = s; }
    if (b.cell !== undefined) {
      const c = b.cell;
      if (!plain(c) || !CAPS[c.cap] || !COLUMNS.includes(c.column)) return bad("cell");
      if (c.reset === true) { if (next.set[c.cap]) { delete next.set[c.cap][c.column]; if (!Object.keys(next.set[c.cap]).length) delete next.set[c.cap]; } }
      else { if (cellValue(c.cap, c.value) === undefined) return bad("cell.value"); (next.set[c.cap] = next.set[c.cap] || {})[c.column] = c.value; }
    }
    await setConfig(env, "pack", next, admin.id);
    return { ok: true, pack: next };
  },
  async "config.prices"(env, b, admin) {
    const err = {}, v = cleanPrices(await config(env, "prices"), b.prices, err);
    if (!v) return bad(err.field);
    await setConfig(env, "prices", v, admin.id);
    return { ok: true, prices: v };
  },
  async "config.seller"(env, b, admin) {
    const err = {}, v = cleanSeller(await config(env, "seller"), b.seller, err);
    if (!v) return bad(err.field);
    await setConfig(env, "seller", v, admin.id);
    return { ok: true, seller: v };
  },
  async "config.sell"(env, b, admin) {
    const err = {}, v = cleanSell(await config(env, "sell"), b.sell, err);
    if (!v) return bad(err.field);
    await setConfig(env, "sell", v, admin.id);
    return { ok: true, sell: v };
  },
  async "config.texts"(env, b, admin) {
    if (!plain(b.texts) || JSON.stringify(b.texts).length > 20000) return bad("texts");
    await setConfig(env, "texts", b.texts, admin.id);
    return { ok: true, texts: b.texts };
  },
  async "config.changes"(env, b, admin) {
    const list = b.changes;
    if (!Array.isArray(list) || list.length > 200 || JSON.stringify(list).length > 60000) return bad("changes");
    for (const e of list) if (!plain(e) || !isDay(e.date) || !Object.entries(e).every(([k, v]) => k === "date" || textish(v))) return bad("changes");
    const sorted = [...list].sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : 0));
    await setConfig(env, "changes", sorted, admin.id);
    return { ok: true, changes: sorted };
  },

  async "grant.add"(env, b, admin) {
    const until = b.until === null || b.until === undefined || b.until === "" ? null : b.until;
    if (until !== null && !isDay(until)) return bad("until");
    if (!REASONS.includes(b.reason)) return bad("reason");
    try { return { ok: true, id: await addGrant(env, { subject: String(b.subject || ""), plan: b.plan, until, reason: b.reason, note: str(b.note ?? "", 500) || "", by: admin.id }) }; }
    catch (e) { if (/bad grant/.test(String(e?.message))) return bad("grant"); throw e; }
  },
  async "grant.end"(env, b) {
    if (!Number.isInteger(b.id)) return bad("id");
    if (!(await env.DB.prepare("SELECT 1 AS x FROM grants WHERE id = ?").bind(b.id).first())) return json({ error: "not found" }, 404);
    await endGrant(env, b.id);
    return { ok: true };
  },

  async "agreement.add"(env, b, admin) {
    if (!["fed-clubs", "fed-all"].includes(b.plan)) return bad("plan");
    const until = b.until === null || b.until === undefined || b.until === "" ? null : b.until;
    if (until !== null && !isDay(until)) return bad("until");
    let subject = "", name = "", org = null;
    if (b.org !== undefined && b.org !== null) {
      org = await orgById(env, b.org);
      if (!org || org.kind === "club") return bad("org");          // a league, a committee or a federation (its clubs are covered)
      subject = `fo${org.id}`; name = org.name;
    } else if (typeof b.cc === "string" && /^[A-Za-z]{2}$/.test(b.cc)) { subject = `f${b.cc.toUpperCase()}`; name = b.cc.toUpperCase(); }
    else return bad("cc");
    const note = str(b.note ?? "", 500) || "";
    let billed = null, lines = null;
    if (b.invoice !== undefined && b.invoice !== null) {
      billed = plain(b.invoice) ? await orgById(env, b.invoice.org) : null;
      lines = plain(b.invoice) ? cleanLines(b.invoice.lines) : null;
      if (!billed) return bad("invoice.org");
      if (!lines) return bad("invoice.lines");
    }
    const id = await addGrant(env, { subject, plan: b.plan, until, reason: "agreement", note, by: admin.id });
    const out = { ok: true, id, subject, mailed: 0 };
    if (billed) {
      const r = await issue(env, { subject, orgId: billed.id, lines, note: str(b.invoice.note ?? "", 1000) || "", by: admin.id });
      if (r.error) out.invoiceError = r.error; else out.invoice = r.invoice;
    }
    if (b.mail === true) {
      const to = org || billed;
      out.mailed = await mailOfficers(env, to?.id, (u) => agreementMail(env, u, { name: org ? org.name : billed?.name || name, plan: b.plan, until, note }));
      if (out.invoice) await mailOfficers(env, billed.id, (u) => clubInvoiceMail(env, u, { club: billed.name, invoice: out.invoice }));
    }
    return out;
  },
  async "agreement.end"(env, b) {
    if (!Number.isInteger(b.id)) return bad("id");
    const g = await env.DB.prepare("SELECT subject FROM grants WHERE id = ?").bind(b.id).first();
    if (!g || !/^f/.test(g.subject)) return json({ error: "not found" }, 404);
    await endGrant(env, b.id);
    return { ok: true };
  },

  async "invoice.issue"(env, b, admin) {
    const org = await orgById(env, b.org);
    if (!org) return bad("org");
    const plan = b.plan === undefined || b.plan === "" || b.plan === null ? "" : b.plan;
    if (plan && plan !== "club") return bad("plan");
    const r = await issue(env, { subject: `o${org.id}`, orgId: org.id, lines: b.lines, plan, periodFrom: b.periodFrom || null, periodTo: b.periodTo || null,
      note: str(b.note ?? "", 1000) || "", by: admin.id });
    if (r.error) return json({ error: r.error }, 400);
    if (plan && b.trust === true) await addGrant(env, { subject: `o${org.id}`, plan, until: addDays(today(), TRUST_DAYS), reason: "trust", note: r.invoice.number, by: admin.id });
    const mailed = b.mail === true ? await mailOfficers(env, org.id, (u) => clubInvoiceMail(env, u, { club: org.name, invoice: r.invoice })) : 0;
    return { ok: true, invoice: r.invoice, mailed };
  },
  async "invoice.paid"(env, b, admin) {
    if (b.at !== undefined && b.at !== null && b.at !== "" && !isDay(b.at)) return bad("at");
    const r = await markPaid(env, b.id, { how: str(b.how ?? "transfer", 40) || "transfer", at: b.at || null, by: admin.id });
    if (r.error) return json({ error: r.error }, r.error === "state" ? 409 : 404);
    let mailed = 0;
    if (b.mail !== false && r.invoice.org_id) {
      const org = await orgById(env, r.invoice.org_id);
      mailed = await mailOfficers(env, r.invoice.org_id, (u) => clubPaidMail(env, u, { club: org?.name || r.invoice.buyer.name || "", invoice: r.invoice }));
    }
    return { ok: true, invoice: r.invoice, mailed };
  },
  async "invoice.unpaid"(env, b) {
    const r = await markUnpaid(env, b.id);
    return r.error ? json({ error: r.error }, r.error === "state" ? 409 : 404) : { ok: true, invoice: r.invoice };
  },
  async "invoice.credit"(env, b, admin) {
    const r = await creditNote(env, b.id, admin.id, str(b.note ?? "", 1000) || "");
    return r.error ? json({ error: r.error }, r.error === "state" ? 409 : 404) : { ok: true, credit: r.credit, invoice: r.invoice };
  },
  async "invoice.event"(env, b, admin, request) {
    if (typeof b.event !== "string" || !/^[\w-]{1,40}$/.test(b.event)) return bad("event");
    const ev = await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(b.event).first();
    if (ev && ev.date && ev.date > today()) return json({ error: "early", date: ev.date }, 400);     // invoiced after the event
    let orgId = ev?.org_id || null;
    if (ev && !orgId) orgId = (await orgOfEvent(env, request, ev).catch(() => null))?.id || null;
    const r = await invoiceEvent(env, ev, orgId, admin.id);
    if (r.error === "exists") return json({ error: "exists", invoice: r.invoice }, 409);
    if (r.error) return json({ error: r.error }, 400);
    const org = await orgById(env, orgId);
    const mailed = b.mail === true ? await mailOfficers(env, orgId, (u) => clubInvoiceMail(env, u, { club: org?.name || "", invoice: r.invoice })) : 0;
    return { ok: true, invoice: r.invoice, mailed };
  },

  async "code.make"(env, b, admin) {
    // (a code is redeemed by a person, POST /api/billing/code, which gives « plus » only: no club code)
    if (b.plan !== undefined && b.plan !== "plus") return bad("plan");
    b.plan = "plus";
    if (!Number.isInteger(b.days) || b.days < 1 || b.days > 3660) return bad("days");
    const max = b.maxUses === undefined ? 1 : b.maxUses;
    if (!Number.isInteger(max) || max < 1 || max > 100000) return bad("maxUses");
    const expires = b.expires === undefined || b.expires === null || b.expires === "" ? null : b.expires;
    if (expires !== null && !isDay(expires)) return bad("expires");
    const reason = b.reason === undefined ? "gift" : b.reason;
    if (!["gift", "founder", "pilot", "staff"].includes(reason)) return bad("reason");
    const code = newCode(), hash = await codeHash(code);
    await env.DB.prepare("INSERT INTO billing_codes (code_hash, plan, days, max_uses, uses, expires, reason, note, by_user, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)")
      .bind(hash, b.plan, b.days, max, expires, reason, str(b.note ?? "", 300) || "", admin.id, nowIso()).run();
    return { ok: true, code, hash };
  },
  async "code.end"(env, b) {
    if (typeof b.hash !== "string" || !/^[0-9a-f]{64}$/.test(b.hash)) return bad("hash");
    const r = await env.DB.prepare("UPDATE billing_codes SET ended_at = ? WHERE code_hash = ? AND ended_at IS NULL").bind(nowIso(), b.hash).run();
    return r.meta?.changes > 0 ? { ok: true } : json({ error: "not found" }, 404);
  },

  async "event.replay"(env, b) {
    if (typeof b.id !== "string" || !/^[\w-]{3,120}$/.test(b.id)) return bad("id");
    try { const r = await replay(env, b.id); return { ok: !!r?.ok, note: String(r?.note || "") }; }
    catch (e) { return { ok: false, note: `failed: ${String(e?.message || e?.code || e?.status || e).slice(0, 200)}` }; }
  },
  async check(env) {
    // (the daily check also sends the clubs' invoice reminders: _lib/billing.js billingDaily → _lib/invoices.js remindInvoices)
    const out = await billingDaily(env, { force: true });
    return { ok: true, ...out, invoiceReminders: out.invoiceReminders || 0 };
  },
};
