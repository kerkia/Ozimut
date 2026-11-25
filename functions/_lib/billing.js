// The individual plan « Ozimut Plus » through Stripe (docs/billing/design.md §5, §10; migration 0034): what the routes
// (api/billing/[[path]].js), the page views' hook (api/track.js: billingSoon), the administrators' API (replay, billingDaily)
// and the account's deletion (dropAccount) share. The subscriptions table is a copy of what Stripe says: it is only ever
// written by syncSubscription, which reads the subscription again from Stripe — so events arriving twice or out of order end
// in the same row. Each e-mail goes once (billing_notices).

import { adminEmails, allow, nowIso, userLang } from "./api.js";
import { stripe, stripeReady } from "./stripe.js";
import { addCredits, billingMode, changed, config, entitlementsOf, funnel, grantsOf, notReady, orgPlan, today } from "./plans.js";
import { queueStatement, sendNow } from "./mail.js";
import { billingAlertMail, cancelledMail, clubInvoiceReminderMail, endedMail, paymentFailedMail, renewalNoticeMail, subscribedMail, trialEndMail } from "./templates.js";
import { remindInvoices } from "./invoices.js";

export const WITHDRAW_DAYS = 14;
const DAY_MS = 86400e3;
const iso = (s) => (s ? new Date(Number(s) * 1000).toISOString() : null);
export const addDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const subjectOf = (user) => `u${user.id}`;
const LIVE = ["active", "past_due", "unpaid", "incomplete"];
/** A subscription row that still runs at Stripe (whatever its payment's state). */
export const running = (row) => !!row && row.source === "stripe" && !row.ended_at && LIVE.includes(row.status);

// ---- e-mails: account e-mails that do not wait for a quota ----------------------------------------------------------------
/** Send at once by whichever provider may take it (mail.js sendNow: Resend, else Scaleway at once); kept in the queue as an
 *  account e-mail (priority 1) only when neither could. */
export async function sendBilling(env, to, mail, kind = "billing") {
  if (!to || !mail) return "none";
  const m = { to, subject: mail.subject, html: mail.html, text: mail.text, kind, priority: 1 };
  let r = "failed";
  try { r = await sendNow(env, m); } catch (e) { /* queued below */ }
  if (r === "sent") return r;
  try { await queueStatement(env, m).run(); return "queued"; } catch (e) { return "failed"; }
}
/** True the first time (subject, kind, ref) is seen: the caller then sends its e-mail. */
export async function once(env, subject, kind, ref = "") {
  const r = await env.DB.prepare("INSERT OR IGNORE INTO billing_notices (subject, kind, ref, at) VALUES (?, ?, ?, ?)")
    .bind(subject, kind, String(ref || ""), nowIso()).run();
  return (r.meta?.changes || 0) > 0;
}
const userOf = async (env, subject) => (/^u\d+$/.test(String(subject || ""))
  ? env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(Number(subject.slice(1))).first() : null);
/** To every administrator, in their language: a dispute, a webhook failure, the daily check's differences. */
export async function alertAdmins(env, what, lines) {
  const emails = adminEmails(env);
  if (!emails.length) return;
  let langs = new Map();
  try {
    const { results } = await env.DB.prepare(`SELECT email, lang FROM users WHERE email IN (${emails.map(() => "?").join(",")})`).bind(...emails).all();
    langs = new Map((results || []).map((u) => [String(u.email).toLowerCase(), userLang(u)]));
  } catch (e) { /* French */ }
  for (const to of emails) await sendBilling(env, to, billingAlertMail(env, langs.get(to) || "fr", what, lines), "billing-alert");
}

// ---- the Stripe customer ----------------------------------------------------------------------------------------------------
/** The Stripe customer of the account (« u<id> »), created once: its id. */
export async function customerFor(env, user) {
  const subject = subjectOf(user);
  const row = await env.DB.prepare("SELECT stripe_customer FROM billing_customers WHERE subject = ?").bind(subject).first();
  if (row?.stripe_customer) return row.stripe_customer;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.display_name || "";
  // (the idempotency key: two requests at once make one customer)
  const c = await stripe(env, "POST", "/v1/customers", { email: user.email, name, preferred_locales: [userLang(user)], metadata: { uid: user.id, subject } },
    { idem: `ozimut-customer-${subject}` });
  await env.DB.prepare(`INSERT INTO billing_customers (subject, stripe_customer, created_at) VALUES (?, ?, ?)
    ON CONFLICT (subject) DO UPDATE SET stripe_customer = COALESCE(billing_customers.stripe_customer, excluded.stripe_customer)`)
    .bind(subject, c.id, nowIso()).run();
  return (await env.DB.prepare("SELECT stripe_customer FROM billing_customers WHERE subject = ?").bind(subject).first())?.stripe_customer || c.id;
}

// ---- the subscription: read again from Stripe, the whole row written -----------------------------------------------------------
const STATUS = { active: "active", trialing: "active", past_due: "past_due", canceled: "canceled", incomplete: "incomplete",
  incomplete_expired: "canceled", unpaid: "unpaid", paused: "unpaid" };
/** A Stripe subscription as the subscriptions row holds it. */
export function rowOf(sub) {
  const item = sub.items?.data?.[0] || {}, price = item.price || sub.plan || {};
  const status = STATUS[sub.status] || "incomplete";
  return {
    plan: sub.metadata?.plan === "plus" || !sub.metadata?.plan ? "plus" : String(sub.metadata.plan).slice(0, 20),
    status, period: price.recurring?.interval || "year",
    current_start: iso(sub.current_period_start ?? item.current_period_start), current_end: iso(sub.current_period_end ?? item.current_period_end),
    cancel_at_end: sub.cancel_at_period_end && status !== "canceled" ? 1 : 0, stripe_sub: sub.id, price_id: String(price.id || ""),
    amount: Number(price.unit_amount) || 0, currency: String(price.currency || sub.currency || "eur").toLowerCase(),
    ended_at: status === "canceled" ? iso(sub.ended_at || sub.canceled_at) || nowIso() : null,
  };
}
/**
 * Read the subscription again from Stripe and write the whole row of its subject (the subscription's metadata `subject`, else
 * its customer's). -> { subject, before, row } (before: the row as it was, or null), or null when nobody here owns it.
 * A subscription that ended is not written over another one of the same subject that still runs (an old one's late event).
 */
export async function syncSubscription(env, stripeSubId) {
  let sub;
  try { sub = await stripe(env, "GET", `/v1/subscriptions/${encodeURIComponent(stripeSubId)}`); }
  catch (e) {
    if (e?.status !== 404) throw e;
    // Stripe no longer knows it: the row that names it ends
    const gone = await env.DB.prepare("SELECT * FROM subscriptions WHERE stripe_sub = ?").bind(stripeSubId).first();
    if (!gone || gone.status === "canceled") return gone ? { subject: gone.subject, before: gone, row: gone } : null;
    await env.DB.prepare("UPDATE subscriptions SET status = 'canceled', cancel_at_end = 0, ended_at = ?, updated_at = ? WHERE stripe_sub = ?").bind(nowIso(), nowIso(), stripeSubId).run();
    changed();
    return { subject: gone.subject, before: gone, row: { ...gone, status: "canceled", cancel_at_end: 0, ended_at: nowIso() } };
  }
  let subject = /^u\d+$/.test(String(sub.metadata?.subject || "")) ? sub.metadata.subject : null;
  if (!subject && sub.customer) {
    subject = (await env.DB.prepare("SELECT subject FROM billing_customers WHERE stripe_customer = ?").bind(String(sub.customer.id || sub.customer)).first())?.subject || null;
  }
  if (!subject) return null;
  const r = rowOf(sub), now = nowIso();
  const before = await env.DB.prepare("SELECT * FROM subscriptions WHERE subject = ?").bind(subject).first();
  if (before && before.source === "stripe" && before.stripe_sub && before.stripe_sub !== r.stripe_sub && r.status === "canceled" && running(before)) {
    return { subject, before, row: before, stale: true };
  }
  const same = before?.stripe_sub === r.stripe_sub;
  // (first_paid_at and renew_notice are Ozimut's own: kept for the same subscription, started afresh for a new one)
  await env.DB.prepare(`INSERT INTO subscriptions (subject, plan, status, period, current_start, current_end, cancel_at_end, stripe_sub, price_id, amount,
      currency, first_paid_at, renew_notice, ended_at, source, invoice_id, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'stripe', NULL, ?)
    ON CONFLICT (subject) DO UPDATE SET plan = excluded.plan, status = excluded.status, period = excluded.period, current_start = excluded.current_start,
      current_end = excluded.current_end, cancel_at_end = excluded.cancel_at_end, stripe_sub = excluded.stripe_sub, price_id = excluded.price_id,
      amount = excluded.amount, currency = excluded.currency, first_paid_at = excluded.first_paid_at, renew_notice = excluded.renew_notice,
      ended_at = excluded.ended_at, source = 'stripe', invoice_id = NULL, updated_at = excluded.updated_at`)
    .bind(subject, r.plan, r.status, r.period, r.current_start, r.current_end, r.cancel_at_end, r.stripe_sub, r.price_id, r.amount, r.currency,
      same ? before.first_paid_at : null, same ? before.renew_notice : null, r.ended_at, now).run();
  changed();
  return { subject, before: before || null, row: { subject, ...r, first_paid_at: same ? before.first_paid_at : null, renew_notice: same ? before.renew_notice : null, source: "stripe" } };
}
/** The first payment's moment, written once (the 14 days of withdrawal count from it). */
async function firstPaid(env, subject, stripeSubId, at) {
  await env.DB.prepare("UPDATE subscriptions SET first_paid_at = ? WHERE subject = ? AND stripe_sub = ? AND first_paid_at IS NULL")
    .bind(at || nowIso(), subject, stripeSubId).run();
}

// ---- the webhook's events ---------------------------------------------------------------------------------------------------
const subIdOf = (o) => (typeof o === "string" ? o : o?.id) || null;
/** The e-mails a change of the row calls for (s: syncSubscription's answer): the termination noted, the end. Each once. */
export async function transitions(env, s) {
  if (!s || s.stale) return;
  const { subject, before, row } = s;
  const user = await userOf(env, subject);
  if (!user) return;
  if (row.status === "canceled") {
    if (before?.status !== "canceled" && await once(env, subject, "ended", row.stripe_sub)) await sendBilling(env, user.email, endedMail(env, user, { end: row.ended_at }));
  } else if (row.cancel_at_end && !(before?.stripe_sub === row.stripe_sub && before?.cancel_at_end)) {
    if (await once(env, subject, "cancelled", `${row.stripe_sub}:${row.current_end}`)) await sendBilling(env, user.email, cancelledMail(env, user, { end: row.current_end }));
  } else if (!row.cancel_at_end && before?.cancel_at_end) {
    // resumed: a later termination of the same period is told again
    await env.DB.prepare("DELETE FROM billing_notices WHERE subject = ? AND kind = 'cancelled'").bind(subject).run();
  }
}
/** The welcome of a subscription just paid, once. */
async function welcome(env, subject, row) {
  if (!row || row.status !== "active" || !(await once(env, subject, "subscribed", row.stripe_sub))) return;
  await funnel(env, "paid", "plus");
  const user = await userOf(env, subject);
  if (user) await sendBilling(env, user.email, subscribedMail(env, user, { amount: row.amount, currency: row.currency, end: row.current_end, withdrawDays: WITHDRAW_DAYS }));
}

/**
 * Apply one Stripe event (already verified, or fetched from Stripe): -> a short note for billing_events. Throws when it could
 * not be applied (Stripe then sends it again). Whatever the event says, the subscription is read again from Stripe.
 */
export async function handleEvent(env, ev) {
  const o = ev.data?.object || {}, type = String(ev.type || "");
  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    const paid = o.payment_status === "paid" || o.payment_status === "no_payment_required";
    if (o.mode === "subscription") {
      const id = subIdOf(o.subscription);
      if (!id) return "no subscription";
      const s = await syncSubscription(env, id);
      if (!s) return "unknown subject";
      if (paid && !s.stale) {
        await firstPaid(env, s.subject, id, iso(ev.created));
        await welcome(env, s.subject, s.row);
      }
      return `${s.subject} ${s.row.status}`;
    }
    if (o.mode === "payment") {
      const subject = String(o.metadata?.subject || ""), k = String(o.metadata?.k || ""), n = Number(o.metadata?.n);
      if (!paid) return "not paid yet";
      if (!/^u\d+$/.test(subject) || k !== "genKm2" || !(n > 0) || n > 10000) return "not a pack";
      if (!(await once(env, subject, "pack", o.id))) return "pack already credited";
      await addCredits(env, subject, k, n);
      await funnel(env, "paid", "mapPack");
      return `${subject} +${n} ${k}`;
    }
    return "ignored";
  }
  if (/^customer\.subscription\.(created|updated|deleted|paused|resumed)$/.test(type)) {
    const s = await syncSubscription(env, o.id);
    if (!s) return "unknown subject";
    await transitions(env, s);
    return `${s.subject} ${s.row.status}${s.stale ? " (an older subscription)" : ""}`;
  }
  if (type === "invoice.paid" || type === "invoice.payment_succeeded" || type === "invoice.payment_failed") {
    const id = subIdOf(o.subscription) || subIdOf(o.parent?.subscription_details?.subscription);
    if (!id) return "no subscription";
    const s = await syncSubscription(env, id);
    if (!s) return "unknown subject";
    if (s.stale) return `${s.subject} (an older subscription)`;
    if (type === "invoice.payment_failed") {
      const user = await userOf(env, s.subject);
      if (user && s.row.status !== "canceled" && await once(env, s.subject, "payfail", o.id)) {
        await sendBilling(env, user.email, paymentFailedMail(env, user, { amount: Number(o.amount_due) || s.row.amount, currency: o.currency || s.row.currency, next: iso(o.next_payment_attempt) }));
      }
    } else if (Number(o.amount_paid) > 0) {
      await firstPaid(env, s.subject, id, iso(o.status_transitions?.paid_at || ev.created));
      await welcome(env, s.subject, s.row);
    }
    await transitions(env, s);
    return `${s.subject} ${s.row.status}`;
  }
  if (type === "charge.refunded") return `refunded ${Number(o.amount_refunded) || 0}`;
  if (type === "charge.dispute.created") {
    if (await once(env, "admin", "dispute", o.id)) await alertAdmins(env, "dispute", [`dispute ${o.id}`, `charge ${subIdOf(o.charge) || "?"}`, `amount ${Number(o.amount) || 0} ${o.currency || ""}`, `reason ${o.reason || "?"}`]);
    return "dispute: administrators told";
  }
  if (/^charge\.dispute\./.test(type)) return `dispute ${o.status || ""}`.trim();
  return "ignored";
}

const refOf = (ev) => String(ev.data?.object?.id || "").slice(0, 80);
/**
 * A verified event, applied once: -> { status, body } for the webhook's answer (200 handled, ignored or already applied; 500
 * a failure, kept with its note, which Stripe retries and an administrator may replay).
 */
export async function applyEvent(env, ev) {
  const ins = await env.DB.prepare("INSERT OR IGNORE INTO billing_events (event_id, type, at, ok, note, ref) VALUES (?, ?, ?, 0, '', ?)")
    .bind(ev.id, String(ev.type).slice(0, 80), nowIso(), refOf(ev)).run();
  if (!(ins.meta?.changes > 0)) {
    const seen = await env.DB.prepare("SELECT ok FROM billing_events WHERE event_id = ?").bind(ev.id).first();
    if (seen?.ok) return { status: 200, body: { ok: true, duplicate: true } };
  }
  try {
    const note = await handleEvent(env, ev);
    await env.DB.prepare("UPDATE billing_events SET ok = 1, note = ? WHERE event_id = ?").bind(String(note || "").slice(0, 300), ev.id).run();
    return { status: 200, body: { ok: true, note } };
  } catch (e) {
    const note = `failed: ${String(e?.message || e?.code || e).slice(0, 250)}`;
    await env.DB.prepare("UPDATE billing_events SET ok = 0, note = ? WHERE event_id = ?").bind(note, ev.id).run().catch(() => {});
    if (await once(env, "admin", "webhook", ev.id).catch(() => false)) await alertAdmins(env, "webhook", [`event ${ev.id}`, `type ${ev.type}`, note]).catch(() => {});
    return { status: 500, body: { error: "failed" } };
  }
}
/** The administrators' « replay »: the event fetched again from Stripe and applied again, whatever was kept of it.
 *  -> { ok, note } (throws { status, code, message } when Stripe does not know the event). */
export async function replay(env, eventId) {
  const ev = await stripe(env, "GET", `/v1/events/${encodeURIComponent(String(eventId))}`);
  await env.DB.prepare("INSERT OR IGNORE INTO billing_events (event_id, type, at, ok, note, ref) VALUES (?, ?, ?, 0, '', ?)")
    .bind(ev.id, String(ev.type).slice(0, 80), nowIso(), refOf(ev)).run();
  try {
    const note = await handleEvent(env, ev);
    await env.DB.prepare("UPDATE billing_events SET ok = 1, note = ? WHERE event_id = ?").bind(`replayed: ${String(note || "").slice(0, 280)}`, ev.id).run();
    return { ok: true, note };
  } catch (e) {
    const note = `failed: ${String(e?.message || e?.code || e).slice(0, 250)}`;
    await env.DB.prepare("UPDATE billing_events SET ok = 0, note = ? WHERE event_id = ?").bind(note, ev.id).run();
    return { ok: false, note };
  }
}

// ---- the account's state (GET /api/billing) -----------------------------------------------------------------------------------
/** The prices a page may show: amounts only, never a Stripe id. */
export function displayPrices(prices) {
  const p = prices.plus || {}, founder = !!(p.founderUntil && p.founderUntil >= today() && p.stripe?.founder);
  return { currency: prices.currency || "eur", trialDays: Number(prices.trialDays) || 0,
    plus: { year: p.year, ...(founder ? { founder: p.founder, founderUntil: p.founderUntil } : {}), ready: !!(founder ? p.stripe.founder : p.stripe?.year) },
    club: { year: prices.club?.year, small: prices.club?.small, smallMax: prices.club?.smallMax },
    event: { perEntry: prices.event?.perEntry, cap: prices.event?.cap },
    fed: { clubs: prices.fed?.clubs, all: prices.fed?.all },
    mapPack: { km2: prices.mapPack?.km2, amount: prices.mapPack?.amount, ready: !!prices.mapPack?.stripe } };
}
const INVOICES = new Map();          // customer -> { at, list }: Stripe's invoices, kept a minute an isolate
async function invoicesOf(env, customer) {
  if (!customer || !stripeReady(env)) return [];
  const kept = INVOICES.get(customer);
  if (kept && Date.now() - kept.at < 60e3) return kept.list;
  let list = [];
  try {
    const r = await stripe(env, "GET", "/v1/invoices", { customer, limit: 12 });
    list = (r.data || []).filter((i) => i.status === "paid" || i.status === "open").map((i) => ({ id: i.id, number: i.number || "", day: (iso(i.created) || "").slice(0, 10),
      amount: Number(i.status === "paid" ? i.amount_paid : i.amount_due) || 0, currency: i.currency || "eur", status: i.status, url: i.hosted_invoice_url || null, pdf: i.invoice_pdf || null }));
  } catch (e) { return kept?.list || []; }
  if (INVOICES.size > 500) INVOICES.clear();
  INVOICES.set(customer, { at: Date.now(), list });
  return list;
}
/** What the app gets: the plan's state, no price, no link. */
export async function planOf(env, user) {
  const e = await entitlementsOf(env, user);
  return { plan: e.plan, why: e.why };
}
/** { plan, sub, trial, grants, why, prices, canTrial, withdrawUntil, invoices, orgs } */
export async function stateOf(env, user) {
  const subject = subjectOf(user);
  const [e, prices, row, cust, grants] = await Promise.all([entitlementsOf(env, user), config(env, "prices"),
    env.DB.prepare("SELECT * FROM subscriptions WHERE subject = ?").bind(subject).first(),
    env.DB.prepare("SELECT stripe_customer FROM billing_customers WHERE subject = ?").bind(subject).first(), grantsOf(env, subject)]);
  const live = running(row);
  const sub = row && row.source === "stripe" ? { plan: row.plan, status: row.status, period: row.period, start: row.current_start, end: row.current_end,
    cancelAtEnd: !!row.cancel_at_end, amount: row.amount, currency: row.currency, firstPaidAt: row.first_paid_at, endedAt: row.ended_at } : null;
  const until = row?.first_paid_at ? new Date(Date.parse(row.first_paid_at) + WITHDRAW_DAYS * DAY_MS).toISOString() : null;
  // the clubs the account belongs to in force, with their plan and whether it may manage their billing
  let orgs = [];
  try {
    const { results } = await env.DB.prepare(`SELECT o.id, o.name, m.roles, m.until FROM org_members m JOIN orgs o ON o.id = m.org_id
      WHERE m.user_id = ? AND m.state = 'ok' ORDER BY o.name`).bind(user.id).all();
    for (const o of results || []) {
      if (o.until && o.until < today()) continue;
      const p = await orgPlan(env, o.id), roles = String(o.roles || "").split(",").map((x) => x.trim());
      orgs.push({ id: o.id, name: o.name, plan: p.plan, until: p.until, may: roles.includes("manager") || roles.includes("treasurer") });
    }
  } catch (err) { orgs = []; }          // before migration 0030
  return {
    plan: e.plan, sub, trial: e.trial, why: e.why,
    grants: grants.filter((g) => g.live).map((g) => ({ id: g.id, plan: g.plan, until: g.until, reason: g.reason })),
    prices: displayPrices(prices),
    canTrial: !live && !grants.some((g) => g.reason === "trial"),
    withdrawUntil: live && until && until > nowIso() ? until : null,
    canPortal: !!cust?.stripe_customer, invoices: await invoicesOf(env, cust?.stripe_customer), orgs,
  };
}

// ---- the daily check ----------------------------------------------------------------------------------------------------------
let lastSoon = 0;
/** From a page view (api/track.js): the daily check when due — at most every 10 minutes an isolate asks D1 whether today's
 *  has run. Nothing while the switch is off. */
export function billingSoon(ctx) {
  if (billingMode(ctx.env) === "off" || Date.now() - lastSoon < 10 * 60e3) return;
  lastSoon = Date.now();
  ctx.waitUntil(billingDaily(ctx.env).catch(() => null));
}
/**
 * Once a day for the whole site (a D1 rate key; `force`: the administrators' « run the check now »): Stripe's subscriptions
 * against D1, the differences repaired and mailed to the administrators; grants and transfer-paid subscriptions past their end
 * closed; the trial's end notice (3 days before); the yearly renewal notice (between 60 and 30 days before the period's end);
 * the clubs' invoices past their due day reminded once.
 * -> { ran, repaired: [..], closed, trialNotices, renewalNotices, invoiceReminders } (ran false: already done today, the switch
 * off, or no tables).
 */
export async function billingDaily(env, { force = false } = {}) {
  const out = { ran: false, repaired: [], closed: 0, trialNotices: 0, renewalNotices: 0, invoiceReminders: 0 };
  if (billingMode(env) === "off" || !env.DB) return out;
  try {
    if (!force && !(await allow(env, "billing:daily", 1, 86400))) return out;
    out.ran = true;
    const day = today(), now = nowIso();

    // 1. Stripe against D1
    if (stripeReady(env)) {
      try {
        const seen = new Set();
        let after = null;
        for (let page = 0; page < 20; page++) {
          const r = await stripe(env, "GET", "/v1/subscriptions", { status: "all", limit: 100, ...(after ? { starting_after: after } : {}) });
          for (const sub of r.data || []) {
            seen.add(sub.id);
            const want = rowOf(sub);
            const have = await env.DB.prepare("SELECT * FROM subscriptions WHERE stripe_sub = ?").bind(sub.id).first();
            if (!have && want.status === "canceled") continue;                       // an old one, replaced or never ours
            if (have && have.status === want.status && have.current_end === want.current_end && !!have.cancel_at_end === !!want.cancel_at_end && have.price_id === want.price_id) continue;
            const s = await syncSubscription(env, sub.id);
            if (s && !s.stale) { out.repaired.push(`${s.subject} ${sub.id}: ${have ? `${have.status} → ${s.row.status}` : `missing → ${s.row.status}`}`); await transitions(env, s); }
            else if (!s && want.status !== "canceled" && await once(env, "admin", "orphan", sub.id)) out.repaired.push(`${sub.id}: ${want.status} at Stripe, no account here (told once)`);
          }
          if (!r.has_more || !(r.data || []).length) break;
          after = r.data[r.data.length - 1].id;
        }
        // rows that still run here and that Stripe did not list
        const { results } = await env.DB.prepare("SELECT subject, stripe_sub, status FROM subscriptions WHERE source = 'stripe' AND ended_at IS NULL AND stripe_sub IS NOT NULL").all();
        for (const row of results || []) {
          if (seen.has(row.stripe_sub)) continue;
          const s = await syncSubscription(env, row.stripe_sub);
          if (s && s.row.status !== row.status) { out.repaired.push(`${row.subject} ${row.stripe_sub}: ${row.status} → ${s.row.status}`); await transitions(env, s); }
        }
      } catch (e) { out.repaired.push(`Stripe could not be read: ${String(e?.message || e?.code || e).slice(0, 120)}`); }
      if (out.repaired.length) await alertAdmins(env, "check", out.repaired.slice(0, 40));
    }

    // 2. what is past its end
    const g = await env.DB.prepare("UPDATE grants SET ended_at = ? WHERE ended_at IS NULL AND until IS NOT NULL AND until < ?").bind(now, day).run();
    const s = await env.DB.prepare(`UPDATE subscriptions SET status = 'canceled', ended_at = ?, updated_at = ?
      WHERE source = 'invoice' AND ended_at IS NULL AND current_end IS NOT NULL AND substr(current_end, 1, 10) < ?`).bind(now, now, day).run();
    out.closed = (g.meta?.changes || 0) + (s.meta?.changes || 0);
    if (out.closed) changed();

    // 3. a trial ending within 3 days: nothing happens unless they subscribe
    const { results: trials } = await env.DB.prepare(`SELECT g.id, g.subject, g.until FROM grants g WHERE g.reason = 'trial' AND g.ended_at IS NULL
      AND g.subject LIKE 'u%' AND g.until >= ? AND g.until <= ?`).bind(day, addDays(day, 3)).all();
    for (const t of trials || []) {
      const row = await env.DB.prepare("SELECT * FROM subscriptions WHERE subject = ?").bind(t.subject).first();
      if (running(row) || !(await once(env, t.subject, "trial-end", String(t.id)))) continue;
      const user = await userOf(env, t.subject);
      if (!user) continue;
      await sendBilling(env, user.email, trialEndMail(env, user, { until: t.until, price: displayPrices(await config(env, "prices")) }));
      out.trialNotices++;
    }

    // 4. the yearly notice before a renewal (French consumer law): the date, the amount, how to terminate — once a period
    const { results: due } = await env.DB.prepare(`SELECT * FROM subscriptions WHERE source = 'stripe' AND status = 'active' AND ended_at IS NULL
      AND cancel_at_end = 0 AND current_end IS NOT NULL AND substr(current_end, 1, 10) >= ? AND substr(current_end, 1, 10) <= ?
      AND (renew_notice IS NULL OR renew_notice != current_end)`).bind(addDays(day, 30), addDays(day, 60)).all();
    for (const row of due || []) {
      if (!(await once(env, row.subject, "renewal", row.current_end))) continue;
      await env.DB.prepare("UPDATE subscriptions SET renew_notice = ? WHERE subject = ?").bind(row.current_end, row.subject).run();
      const user = await userOf(env, row.subject);
      if (!user) continue;
      await sendBilling(env, user.email, renewalNoticeMail(env, user, { end: row.current_end, amount: row.amount, currency: row.currency }));
      out.renewalNotices++;
    }

    // 5. the clubs' invoices past their due day: reminded once each (_lib/invoices.js)
    try { out.invoiceReminders = await remindInvoices(env, (to, mail) => sendBilling(env, to, mail), (u, x) => clubInvoiceReminderMail(env, u, x)); }
    catch (e) { if (!notReady(e)) throw e; }
  } catch (e) { if (!notReady(e)) throw e; out.ran = false; }
  return out;
}

// ---- the account's deletion ---------------------------------------------------------------------------------------------------
/** The Stripe subscription cancelled at once; the subject's customer row, grants, counters, credits, notices and subscription
 *  row deleted. Never throws (before the migration, Stripe unreachable: the account goes all the same). */
export async function dropAccount(env, userId) {
  const subject = `u${userId}`;
  try {
    const row = await env.DB.prepare("SELECT * FROM subscriptions WHERE subject = ?").bind(subject).first();
    if (running(row) && row.stripe_sub && env.STRIPE_SECRET_KEY) {
      try { await stripe(env, "DELETE", `/v1/subscriptions/${encodeURIComponent(row.stripe_sub)}`, { prorate: false, invoice_now: false }, { idem: `ozimut-drop-${row.stripe_sub}` }); }
      catch (e) { await once(env, "admin", "drop", row.stripe_sub).then((first) => first && alertAdmins(env, "check", [`${row.stripe_sub}: its account was deleted and Stripe could not be told to cancel it (${String(e?.code || e?.status || "")}) — cancel it in Stripe`])).catch(() => {}); }
    }
    await env.DB.batch([
      env.DB.prepare("DELETE FROM subscriptions WHERE subject = ?").bind(subject),
      env.DB.prepare("DELETE FROM billing_customers WHERE subject = ?").bind(subject),
      env.DB.prepare("DELETE FROM grants WHERE subject = ?").bind(subject),
      env.DB.prepare("DELETE FROM usage_counters WHERE subject = ?").bind(subject),
      env.DB.prepare("DELETE FROM usage_credits WHERE subject = ?").bind(subject),
      env.DB.prepare("DELETE FROM billing_code_uses WHERE subject = ?").bind(subject),
      env.DB.prepare("DELETE FROM billing_notices WHERE subject = ?").bind(subject),
    ]);
    changed();
  } catch (e) { /* before migration 0034 */ }
}
