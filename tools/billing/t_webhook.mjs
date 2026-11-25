// Ozimut's billing, the Stripe side (docs/billing/design.md §5, §11): the webhook's signature (good, bad, old, a rolled
// secret), an event delivered twice applied once, events out of order ending in the right row, an unknown customer, a failure
// kept and retried, the administrators' replay, the map pack's credits, the daily check's repair, the account's deletion.
// Pure Node (node:sqlite as D1's stand-in, tools/billing/fake_stripe.mjs behind fetch), no dependency:
//   node tools/billing/t_webhook.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createFake } from "./fake_stripe.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mod = (p) => import(pathToFileURL(join(ROOT, p)).href);

// ---- D1's stand-in ----------------------------------------------------------------------------------------------------------
function d1() {
  const db = new DatabaseSync(":memory:");
  const val = (v) => (v === undefined ? null : typeof v === "boolean" ? (v ? 1 : 0) : v);
  const rows = (sql) => /^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql);
  class Stmt {
    constructor(sql, args = []) { this.sql = sql; this.args = args; }
    bind(...a) { return new Stmt(this.sql, a.map(val)); }
    exec() {
      const st = db.prepare(this.sql);
      if (rows(this.sql)) return { results: st.all(...this.args).map((r) => ({ ...r })), meta: { changes: 0 }, success: true };
      const r = st.run(...this.args);
      return { results: [], meta: { changes: Number(r.changes) }, success: true };
    }
    async first() { return this.exec().results[0] || null; }
    async all() { return this.exec(); }
    async run() { return this.exec(); }
  }
  return {
    raw: db,
    prepare: (sql) => new Stmt(sql),
    async batch(list) {
      db.exec("BEGIN");
      try { const out = list.map((s) => s.exec()); db.exec("COMMIT"); return out; }
      catch (e) { db.exec("ROLLBACK"); throw e; }
    },
  };
}

const DB = d1();
DB.raw.exec(readFileSync(join(ROOT, "migrations", "0034_billing.sql"), "utf8"));
DB.raw.exec(`
  CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, email_verified INTEGER, status TEXT, first_name TEXT, last_name TEXT,
    display_name TEXT, lang TEXT, licence TEXT, preview TEXT, demo_until TEXT, birth_year INTEGER);
  CREATE TABLE rate (k TEXT, window INTEGER, n INTEGER, PRIMARY KEY (k, window));
  CREATE TABLE mail_log (ts INTEGER, kind TEXT, provider TEXT);
  CREATE TABLE mail_queue (id INTEGER PRIMARY KEY, to_email TEXT, subject TEXT, html TEXT, text TEXT, kind TEXT, priority INTEGER,
    created_at INTEGER, token_hash TEXT, token_ttl INTEGER, attempts INTEGER DEFAULT 0);
  INSERT INTO users VALUES (1, 'anne@example.test', 1, 'active', 'Anne', 'Essai', 'Anne ESSAI', 'fr', '', '', NULL, 1990);
  INSERT INTO users VALUES (2, 'ben@example.test', 1, 'active', 'Ben', 'Test', 'Ben TEST', 'de', '', '', NULL, 1985);
  INSERT INTO users VALUES (9, 'admin@example.test', 1, 'active', 'Ada', 'Admin', 'Ada ADMIN', 'en', '', '', NULL, 1980);
`);
const put = (k, v) => DB.raw.prepare("INSERT OR REPLACE INTO billing_config (k, json, updated_at) VALUES (?, ?, 'now')").run(k, JSON.stringify(v));
put("prices", { plus: { stripe: { year: "price_plus_year_2900", founder: "" } }, mapPack: { stripe: "price_pack_1000" } });
put("sell", { individuals: "all" });

const env = { DB, BILLING: "live", SESSION_SECRET: "test-session-secret", STRIPE_SECRET_KEY: "sk_test_fake", STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_API: "http://stripe.fake", SITE_URL: "http://site.test", DEV_ECHO: "1", MAIL_FROM: "alert@site.test", ADMIN_EMAILS: "admin@example.test" };

// ---- Stripe's stand-in behind fetch; its events wait in an outbox the test delivers as it likes -------------------------------
const outbox = [];
const fake = createFake({ secret: env.STRIPE_WEBHOOK_SECRET, origin: env.STRIPE_API, deliver: async (ev, header, body) => { outbox.push({ ev, header, body }); return 0; } });
let stripeDown = false, stripeCalls = 0;
globalThis.fetch = async (url, init = {}) => {
  if (!String(url).startsWith(env.STRIPE_API)) throw new Error(`unexpected fetch ${url}`);
  stripeCalls++;
  if (stripeDown) return new Response(JSON.stringify({ error: { type: "api_error", message: "down" } }), { status: 500 });
  const r = await fake.handle(init.method || "GET", String(url), init.headers || {}, init.body || "");
  await fake.flush();
  return new Response(JSON.stringify(r.json), { status: r.status, headers: { "Content-Type": "application/json" } });
};
// the e-mails « sent » (DEV_ECHO prints them): kept, not shown
const mails = [];
const log = console.log;
console.log = (...a) => { const s = String(a[0]); if (s.startsWith("[mail")) mails.push(s.split("\n")[0]); else log(...a); };

const { signSession } = await mod("functions/_middleware.js");
const { onRequest } = await mod("functions/api/billing/[[path]].js");
const B = await mod("functions/_lib/billing.js");
const S = await mod("functions/_lib/stripe.js");

// ---- helpers ------------------------------------------------------------------------------------------------------------------
let failed = 0, n = 0;
const ok = (cond, what) => { n++; if (!cond) { failed++; log(`  FAIL ${what}`); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(b)}`);
const waits = [];
const ctxOf = (request, path) => ({ request, env, params: { path }, waitUntil: (p) => waits.push(p) });
const settle = async () => { while (waits.length) await waits.shift(); };
async function call(uid, method, op, body, headers = {}) {
  const cookie = uid ? `cnx_session=${await signSession({ uid, exp: Date.now() + 3600e3, chk: Date.now(), cc: [] }, env.SESSION_SECRET)}` : "";
  const req = new Request(`http://site.test/api/billing${op ? `/${op}` : ""}`, { method, headers: { ...(cookie ? { Cookie: cookie } : {}), "Content-Type": "application/json", ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const res = await onRequest(ctxOf(req, op ? op.split("/") : undefined));
  await settle();
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function hook(body, header) {
  const req = new Request("http://site.test/api/billing/webhook", { method: "POST", headers: { "Stripe-Signature": header, "Content-Type": "application/json" }, body });
  const res = await onRequest(ctxOf(req, ["webhook"]));
  await settle();
  return { status: res.status, body: await res.json().catch(() => null) };
}
const deliver = (m) => hook(m.body, m.header);
const take = (type) => { const i = outbox.findIndex((m) => m.ev.type === type); if (i < 0) throw new Error(`no ${type} in the outbox`); return outbox.splice(i, 1)[0]; };
const subRow = (uid) => DB.raw.prepare("SELECT * FROM subscriptions WHERE subject = ?").get(`u${uid}`);
const evRow = (id) => DB.raw.prepare("SELECT * FROM billing_events WHERE event_id = ?").get(id);
const count = (sql, ...a) => Number(Object.values(DB.raw.prepare(sql).get(...a))[0]);
const sessionOf = (url) => url.split("/").pop();

// ---- 0. the form encoding -----------------------------------------------------------------------------------------------------
eq(S.encodeForm({ a: 1, b: { c: [true, { d: "x y" }] }, e: null }), "a=1&b%5Bc%5D%5B0%5D=true&b%5Bc%5D%5B1%5D%5Bd%5D=x%20y", "encodeForm");

// ---- 1. the signature ---------------------------------------------------------------------------------------------------------
{
  const body = JSON.stringify({ id: "evt_sig1", object: "event", type: "ping.unknown", created: 1, data: { object: { id: "x" } } });
  const t = Math.floor(Date.now() / 1000);
  eq((await hook(body, fake.sign(body))).status, 200, "a good signature");
  eq((await hook(body, `t=${t},v1=${"0".repeat(64)}`)).status, 400, "a bad signature");
  eq((await hook(body.replace("ping", "pong"), fake.sign(body))).status, 400, "a body changed after signing");
  eq((await hook(body, fake.sign(body, t - 600))).status, 400, "a signature 10 minutes old");
  eq((await hook(body, fake.sign(body, t + 600))).status, 400, "a signature 10 minutes ahead");
  eq((await hook(body, `${fake.sign(body)},v1=${"a".repeat(64)}`.replace(/^(t=\d+),(v1=\w+),(v1=\w+)$/, "$1,$3,$2"))).status, 200, "two v1, the good one second");
  eq((await hook(body, "")).status, 400, "no signature header");
  eq((await hook(body, "v1=abc")).status, 400, "no timestamp");
  const other = JSON.stringify({ id: "evt_sig2", object: "event", type: "ping.unknown", created: 1, data: { object: { id: "x" } } });
  eq((await hook(other, await (async () => `t=${t},v1=${await S.signature("whsec_other", t, other)}`)())).status, 400, "another secret");
  eq(evRow("evt_sig1")?.note, "ignored", "an unknown type is kept as ignored");
  ok(!evRow("evt_sig2"), "a refused event leaves no row");
}

// ---- 2. a subscription whose events arrive in the wrong order -------------------------------------------------------------------
eq((await call(1, "POST", "checkout", { plan: "plus" })).body, { error: "consent" }, "checkout without startNow");
eq((await call(0, "POST", "checkout", { plan: "plus", startNow: true })).status, 401, "checkout without a session");
const co = await call(1, "POST", "checkout", { plan: "plus", startNow: true });
ok(co.status === 200 && /^http/.test(co.body?.url || ""), `checkout gives a url (${JSON.stringify(co.body)})`);
ok(!!DB.raw.prepare("SELECT consent_at FROM billing_customers WHERE subject = 'u1'").get()?.consent_at, "the express request is kept");
const sent = fake.state.sessions[sessionOf(co.body.url)]._params;
eq([sent.mode, sent.client_reference_id, sent.subscription_data.metadata.subject, sent.locale, sent.success_url], ["subscription", "u1", "u1", "fr", "http://site.test/#/reglages?onglet=abonnement&retour=1"], "the session's parameters");
const paid = await fake.levers.pay({ session: sessionOf(co.body.url) });
const SUB = paid.subscription;
eq(outbox.map((m) => m.ev.type), ["checkout.session.completed", "customer.subscription.created", "invoice.paid"], "three events wait");
const evPaid = take("invoice.paid"), evCreated = take("customer.subscription.created"), evDone = take("checkout.session.completed");
eq((await deliver(evPaid)).status, 200, "invoice.paid first");
eq([subRow(1)?.status, subRow(1)?.stripe_sub, subRow(1)?.amount, !!subRow(1)?.first_paid_at], ["active", SUB, 2900, true], "the row after the first event");
eq((await deliver(evCreated)).status, 200, "then subscription.created");
eq((await deliver(evDone)).status, 200, "then checkout.session.completed");
eq(mails.filter((m) => /anne@/.test(m)).length, 1, "one welcome e-mail");
const firstPaid = subRow(1).first_paid_at;

// ---- 3. the same event twice ------------------------------------------------------------------------------------------------------
{
  const calls = stripeCalls, r = await deliver(evDone);
  eq([r.status, r.body?.duplicate], [200, true], "a duplicate answers 200");
  eq(stripeCalls, calls, "…without asking Stripe again");
  eq(count("SELECT COUNT(*) FROM billing_events WHERE event_id = ?", evDone.ev.id), 1, "…kept once");
  eq(mails.filter((m) => /anne@/.test(m)).length, 1, "…and no second e-mail");
  eq(count("SELECT n FROM billing_funnel WHERE step = 'paid' AND k = 'plus'"), 1, "…counted once in the funnel");
  eq(subRow(1).first_paid_at, firstPaid, "the first payment's moment is not moved");
}
const st = await call(1, "GET", "");
eq([st.body?.plan, st.body?.sub?.status, !!st.body?.withdrawUntil, st.body?.canTrial, st.body?.invoices?.length], ["plus", "active", true, false, 1], "the account's state");
eq((await call(1, "POST", "checkout", { plan: "plus", startNow: true })).status, 409, "a second checkout is refused");
eq((await call(1, "GET", "", undefined, { "User-Agent": "Mozilla OzimutApp/1.0 (ios)" })).body && Object.keys((await call(1, "GET", "", undefined, { "User-Agent": "Mozilla OzimutApp/1.0 (ios)" })).body), ["plan", "why"], "the app gets the plan and why only");
eq((await call(1, "POST", "portal", {}, { "User-Agent": "Mozilla OzimutApp/1.0 (ios)" })).status, 403, "the app gets nothing else");

// ---- 4. termination, and stale events ----------------------------------------------------------------------------------------------
eq((await call(1, "POST", "cancel", {})).body?.cancelAtEnd, true, "termination at the period's end");
eq(subRow(1).cancel_at_end, 1, "…in the row");
const evCancel = take("customer.subscription.updated");
eq((await deliver(evCancel)).status, 200, "its event");
eq(mails.filter((m) => /anne@/.test(m)).length, 2, "one e-mail for the termination (the route and the event together)");
eq((await call(1, "POST", "resume", {})).body?.cancelAtEnd, false, "resumed");
outbox.length = 0;
// the old « cancel » event arrives again under a new id, after the resume: the row follows Stripe, not the event's content
{
  const stale = { ...evCancel.ev, id: "evt_stale_cancel" }, body = JSON.stringify(stale);
  eq((await hook(body, fake.sign(body))).status, 200, "a stale event is accepted");
  eq(subRow(1).cancel_at_end, 0, "…and the row stays what Stripe says now");
}
// a payment fails, then the subscription ends; an event of before (status active) comes last
const failedPay = await fake.levers.fail({ sub: SUB });
eq((await deliver(take("invoice.payment_failed"))).status, 200, "invoice.payment_failed");
eq(subRow(1).status, "past_due", "past_due");
eq(mails.filter((m) => /anne@/.test(m)).length, 3, "one e-mail for the failed payment");
ok(!!failedPay.invoice, "the fake made an open invoice");
outbox.length = 0;
await fake.levers.cancel({ sub: SUB });
const evDeleted = take("customer.subscription.deleted");
{
  const old = { ...evCreated.ev, id: "evt_old_created" }, body = JSON.stringify(old);     // says « active »
  eq((await deliver(evDeleted)).status, 200, "subscription.deleted");
  eq((await hook(body, fake.sign(body))).status, 200, "then an old « created » event");
  eq([subRow(1).status, !!subRow(1).ended_at], ["canceled", true], "the row is the ended subscription");
  eq(mails.filter((m) => /anne@/.test(m)).length, 4, "one e-mail for the end");
  eq((await call(1, "GET", "")).body?.plan, "free", "the plan is free again");
}

// ---- 5. a new subscription after an ended one; the old one's late event does not write over it -----------------------------------
const co2 = await call(1, "POST", "checkout", { plan: "plus", startNow: true });
const paid2 = await fake.levers.pay({ session: sessionOf(co2.body.url) });
for (const m of outbox.splice(0)) eq((await deliver(m)).status, 200, `second subscription: ${m.ev.type}`);
eq([subRow(1).status, subRow(1).stripe_sub], ["active", paid2.subscription], "the new subscription's row");
ok(subRow(1).first_paid_at && subRow(1).first_paid_at >= firstPaid, "its own first payment");
{
  const late = { ...evDeleted.ev, id: "evt_late_deleted" }, body = JSON.stringify(late);
  const r = await hook(body, fake.sign(body));
  eq(r.status, 200, "the first subscription's late « deleted »");
  eq([subRow(1).status, subRow(1).stripe_sub], ["active", paid2.subscription], "…leaves the running one alone");
}

// ---- 6. an unknown customer ------------------------------------------------------------------------------------------------------
{
  const cus = (await fake.handle("POST", "/v1/customers", { authorization: "Bearer x" }, "email=nobody%40example.test")).json;
  const s = (await fake.handle("POST", "/v1/checkout/sessions", { authorization: "Bearer x" }, `customer=${cus.id}&mode=subscription&line_items[0][price]=price_x_500`)).json;
  await fake.levers.pay({ session: s.id });
  const before = count("SELECT COUNT(*) FROM subscriptions");
  for (const m of outbox.splice(0)) { const r = await deliver(m); eq([r.status, r.body?.note], [200, "unknown subject"], `unknown customer: ${m.ev.type}`); }
  eq(count("SELECT COUNT(*) FROM subscriptions"), before, "no row for nobody");
}

// ---- 7. a failure is kept, answered 500, and applied when Stripe sends it again ---------------------------------------------------
{
  await fake.levers.renew({ sub: paid2.subscription });
  const m = take("invoice.paid");
  outbox.length = 0;
  stripeDown = true;
  const r = await deliver(m);
  stripeDown = false;
  eq(r.status, 500, "Stripe unreachable: 500");
  eq(evRow(m.ev.id)?.ok, 0, "…kept as failed");
  ok(mails.some((x) => /admin@/.test(x)), "…and the administrators are told");
  const end = subRow(1).current_end;
  eq((await deliver(m)).status, 200, "sent again: applied");
  eq(evRow(m.ev.id)?.ok, 1, "…marked ok");
  ok(subRow(1).current_end > end, "…the renewed period is in the row");
}

// ---- 8. replay -------------------------------------------------------------------------------------------------------------------
{
  DB.raw.prepare("DELETE FROM subscriptions WHERE subject = 'u1'").run();
  const r = await B.replay(env, evDone.ev.id);                 // the first checkout's event: its subscription has ended since
  ok(r.ok, `replay answers ok (${r.note})`);
  eq(subRow(1)?.status, "canceled", "replaying an old event writes what Stripe says of its subscription");
  const r2 = await B.replay(env, fake.state.deliveries.filter((d) => d.type === "customer.subscription.created").map((d) => d.id)[1]);
  ok(r2.ok && subRow(1).status === "active" && subRow(1).stripe_sub === paid2.subscription, "replaying the running one's event brings its row back");
  ok(/^replayed/.test(evRow(evDone.ev.id).note), "the replay is noted");
  let threw = null;
  try { await B.replay(env, "evt_nowhere"); } catch (e) { threw = e; }
  eq(threw?.status, 404, "an event Stripe does not know");
}

// ---- 9. the map pack ----------------------------------------------------------------------------------------------------------------
{
  const p = await call(2, "POST", "pack", { k: "mapPack" });
  ok(p.status === 200 && p.body?.url, `the pack's checkout (${JSON.stringify(p.body)})`);
  await fake.levers.pay({ session: sessionOf(p.body.url) });
  const m = take("checkout.session.completed");
  eq((await deliver(m)).status, 200, "the pack's event");
  const again = { ...m.ev, id: "evt_pack_again" }, body = JSON.stringify(again);
  eq((await hook(body, fake.sign(body))).status, 200, "the same session under another event id");
  eq(count("SELECT n FROM usage_credits WHERE subject = 'u2' AND k = 'genKm2'"), 10, "10 km² credited once");
}

// ---- 10. withdrawal --------------------------------------------------------------------------------------------------------------
{
  const c = await call(2, "POST", "checkout", { plan: "plus", startNow: true });
  const p = await fake.levers.pay({ session: sessionOf(c.body.url) });
  for (const m of outbox.splice(0)) await deliver(m);
  const w = await call(2, "POST", "withdraw", {});
  ok(w.status === 200 && w.body.refund >= 2890 && w.body.refund <= 2900, `the unused share is refunded (${JSON.stringify(w.body)})`);
  eq(subRow(2).status, "canceled", "the subscription ended at once");
  eq(Object.values(fake.state.refunds).length, 1, "one refund at Stripe");
  for (const m of outbox.splice(0)) eq((await deliver(m)).status, 200, `after the withdrawal: ${m.ev.type}`);
  eq(mails.filter((x) => /ben@/.test(x)).length, 2, "two e-mails: the welcome and the withdrawal (no « ended » as well)");
  eq((await call(2, "POST", "withdraw", {})).status, 404, "nothing left to withdraw from");
  DB.raw.prepare("UPDATE subscriptions SET first_paid_at = ? WHERE subject = 'u1'").run(new Date(Date.now() - 15 * 86400e3).toISOString());
  eq((await call(1, "POST", "withdraw", {})).body, { error: "late" }, "after 14 days: refused");
  ok(p.subscription, "");
}

// ---- 11. the daily check repairs a row that drifted --------------------------------------------------------------------------------
{
  DB.raw.prepare("UPDATE subscriptions SET status = 'past_due' WHERE subject = 'u1'").run();
  const before = mails.length;
  const r = await B.billingDaily(env, { force: true });
  ok(r.ran && r.repaired.length === 2 && /past_due → active/.test(r.repaired[0]) && /no account here/.test(r.repaired[1]), `one difference repaired, the subscription of nobody told (${JSON.stringify(r.repaired)})`);
  eq(subRow(1).status, "active", "the row is Stripe's again");
  ok(mails.slice(before).some((x) => /admin@/.test(x)), "the administrators are told");
  eq((await B.billingDaily(env, { force: true })).repaired, [], "nothing to repair the second time");
  // the renewal notice: once, between 60 and 30 days before the end
  DB.raw.prepare("UPDATE subscriptions SET current_end = ? WHERE subject = 'u1'").run(new Date(Date.now() + 45 * 86400e3).toISOString());
  stripeDown = true;                                           // (so that the check does not put Stripe's date back)
  const a = await B.billingDaily(env, { force: true }), b = await B.billingDaily(env, { force: true });
  stripeDown = false;
  eq([a.renewalNotices, b.renewalNotices], [1, 0], "the renewal notice goes once");
  // a trial: once an account, its end notice 3 days before
  eq((await call(9, "POST", "trial", {})).status, 200, "a trial");
  eq((await call(9, "POST", "trial", {})).status, 409, "…once");
  eq((await call(9, "GET", "")).body?.trial && (await call(9, "GET", "")).body.plan, "plus", "the trial gives the plan");
  DB.raw.prepare("UPDATE grants SET until = date('now', '+2 days') WHERE subject = 'u9'").run();
  const t1 = await B.billingDaily(env, { force: true }), t2 = await B.billingDaily(env, { force: true });
  eq([t1.trialNotices, t2.trialNotices], [1, 0], "the trial's end notice goes once");
  DB.raw.prepare("UPDATE grants SET until = date('now', '-2 days') WHERE subject = 'u9'").run();
  eq((await B.billingDaily(env, { force: true })).closed, 1, "a grant past its end is closed");
}

// ---- 12. a code ------------------------------------------------------------------------------------------------------------------
{
  const { sha256hex } = await mod("functions/_lib/crypto.js");
  // stored as api/admin/billing.js stores a code: trimmed, upper-cased, without dashes or spaces
  DB.raw.prepare("INSERT INTO billing_codes (code_hash, plan, days, max_uses, created_at) VALUES (?, 'plus', 90, 1, 'now')").run(await sha256hex("FOUNDER2027"));
  eq((await call(2, "POST", "code", { code: "nope" })).status, 404, "an unknown code");
  const r = await call(2, "POST", "code", { code: "  founder-2027 " });
  ok(r.status === 200 && r.body.plan === "plus", `a code gives a grant (${JSON.stringify(r.body)})`);
  eq((await call(2, "POST", "code", { code: "FOUNDER-2027" })).status, 409, "…once a subject");
  eq((await call(9, "POST", "code", { code: "FOUNDER-2027" })).status, 404, "…and no more than its uses");
  eq(count("SELECT uses FROM billing_codes"), 1, "one use counted");
}

// ---- 13. the account's deletion ----------------------------------------------------------------------------------------------------
{
  await B.dropAccount(env, 1);
  eq(fake.state.subs[paid2.subscription].status, "canceled", "the Stripe subscription is cancelled at once");
  eq(count("SELECT (SELECT COUNT(*) FROM subscriptions WHERE subject = 'u1') + (SELECT COUNT(*) FROM billing_customers WHERE subject = 'u1') + (SELECT COUNT(*) FROM grants WHERE subject = 'u1') + (SELECT COUNT(*) FROM billing_notices WHERE subject = 'u1')"), 0, "nothing of the subject is left");
}

// ---- 14. the switch ------------------------------------------------------------------------------------------------------------------
{
  env.BILLING = "off";
  eq((await call(2, "GET", "")).body, { error: "off" }, "off: the state");
  const body = JSON.stringify({ id: "evt_off", type: "x", data: { object: {} } });
  eq((await hook(body, fake.sign(body))).body, { error: "off" }, "off: the webhook");
  env.BILLING = "test";
  eq((await call(2, "GET", "")).body, { error: "off" }, "test: off for an ordinary account");
  eq((await call(0, "GET", "")).body, { error: "off" }, "test: off without a session");
  eq((await call(9, "GET", "")).status, 200, "test: on for an administrator");
  eq((await call(2, "GET", "org/3")).status, 404, "the clubs' paths are not this file's");
}

console.log = log;
log(failed ? `${failed} of ${n} checks FAILED` : `ok — ${n} checks`);
process.exit(failed ? 1 : 0);
