// Ozimut's own billing, the individual's side (docs/billing/design.md §1, §5; migration 0034): « Ozimut Plus » through Stripe.
//
//   GET  /api/billing            the account's state: { plan, sub, trial, grants, why, prices, canTrial, withdrawUntil, canPortal,
//                                invoices, orgs: [{ id, name, plan, until, may }] } — to the Ozimut app: { plan, why } only
//   GET  /api/billing/offer      public when live (the pricing page): { prices, plans: [{ id, caps }], capsText: [keys] }
//   POST /api/billing/trial      the trial, once an account ever, no card -> { ok, until }
//   POST /api/billing/checkout   { plan: "plus", startNow: true } -> { url } (Stripe Checkout, a yearly subscription)
//   POST /api/billing/portal     -> { url } (Stripe's customer portal: payment method, invoices)
//   POST /api/billing/cancel     termination at the period's end · POST /api/billing/resume: and back
//   POST /api/billing/withdraw   within 14 days of the first payment: ends now, the unused share refunded -> { ok, refund }
//   POST /api/billing/code       { code } -> { ok, plan, until } (a grant from billing_codes)
//   POST /api/billing/pack       { k: "mapPack" } -> { url } (Checkout, one payment; the credits come with the webhook)
//   POST /api/billing/seen       { step, k } the funnel's counts, no account kept
//   POST /api/billing/webhook    Stripe's events: no session, its signature is its proof (public in the login gate)
//
// /api/billing/org/… and /api/billing/event/… are the clubs' (their own files). Order of the checks: the switch (404 « off »),
// the migration (503 « not ready »), then the session. Everything Stripe says is read again from Stripe before it is written
// (_lib/billing.js syncSubscription); the browser never sends an amount, a price or a customer.

import { allow, clientIp, currentUser, json, nowIso, readBody, siteUrl, userLang } from "../../_lib/api.js";
import { sha256hex } from "../../_lib/crypto.js";
import { fromApp } from "../../_middleware.js";
import { CAPS, billingMode, billingOn, changed, config, funnel, notReady, packOf, ready, today } from "../../_lib/plans.js";
import { stripe, stripeReady, verifyWebhook } from "../../_lib/stripe.js";
import { WITHDRAW_DAYS, addDays, applyEvent, customerFor, displayPrices, once, planOf, running, sendBilling, stateOf, subjectOf,
  syncSubscription, transitions } from "../../_lib/billing.js";
import { trialStartMail, withdrawnMail } from "../../_lib/templates.js";

export { replay } from "../../_lib/billing.js";          // (the administrators' API replays an event: _lib/billing.js replay)

const OFF = () => json({ error: "off" }, 404);
const EU = new Set(["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL",
  "PT", "RO", "SK", "SI", "ES", "SE"]);
const STEPS = new Set(["sheet", "pricing", "checkout", "trial", "cancel"]);
// a Stripe error (_lib/stripe.js throws { status, code, message }): 503 when its key is missing, else 502 — never Stripe's message
const stripeError = (e) => (e && typeof e === "object" && "status" in e && "code" in e
  ? json({ error: "stripe", code: e.code }, e.code === "not_configured" ? 503 : 502) : null);
/** A code as billing_codes stores it (api/admin/billing.js codeHash): trimmed, upper-cased, without dashes or spaces. */
const normCode = (code) => String(code || "").trim().toUpperCase().replace(/[-\s]/g, "");

/** The buyer's countries: the account's accepted memberships, and the address the request comes from. */
async function countriesOf(env, request, user) {
  const list = [];
  if (user.licence) list.push("FR");
  try {
    const { results } = await env.DB.prepare("SELECT country FROM user_countries WHERE user_id = ? AND status = 'ok' ORDER BY added_at, rowid").bind(user.id).all();
    for (const r of results || []) if (r.country) list.push(String(r.country).toUpperCase());
  } catch (e) { /* before migration 0014 */ }
  const ip = String(request.headers.get("CF-IPCountry") || request.cf?.country || "").toUpperCase();
  const here = /^[A-Z]{2}$/.test(ip) && !["XX", "T1"].includes(ip) ? ip : "";
  return { all: [...new Set([...list, ...(here ? [here] : [])])], country: here || list[0] || "" };
}
const covers = (rule, cc) => (rule === "all" ? true : rule === "eu" ? EU.has(cc) : rule === "fr" ? cc === "FR" : false);
/** Does Ozimut sell to individuals of one of these countries? (sell.individuals: none | fr | eu | all) */
const sellsTo = (sell, c) => (sell.individuals === "all" ? true : c.all.some((cc) => covers(sell.individuals, cc)));
const LOCALE = { fr: "fr", en: "en", de: "de", es: "es" };

/** Checkout's parameters both kinds of session share. */
async function sessionBase(env, user, c, sell) {
  const site = siteUrl(env), lang = userLang(user), texts = await config(env, "texts");
  const submit = String(texts?.submit?.[lang] || "").slice(0, 1000);
  const mor = sell.mor?.on && Array.isArray(sell.mor.countries) && sell.mor.countries.includes(c.country) && sell.mor.params && typeof sell.mor.params === "object" ? sell.mor.params : {};
  return {
    customer: await customerFor(env, user),
    client_reference_id: subjectOf(user),
    success_url: `${site}/#/reglages?onglet=abonnement&retour=1`,
    cancel_url: `${site}/#/reglages?onglet=abonnement`,
    locale: LOCALE[lang] || "auto",
    ...(texts?.tosInStripe === true ? { consent_collection: { terms_of_service: "required" } } : {}),
    ...(submit ? { custom_text: { submit: { message: submit } } } : {}),
    ...mor,
  };
}

async function webhook(ctx) {
  const { request, env } = ctx;
  if (request.method !== "POST") return json({ error: "method" }, 405);
  if (billingMode(env) === "off") return OFF();
  if (!(await ready(env))) return json({ error: "not ready" }, 503);
  if (!stripeReady(env)) return json({ error: "not configured" }, 503);
  const ev = await verifyWebhook(env, request);
  if (!ev) return json({ error: "signature" }, 400);
  const r = await applyEvent(env, ev);
  return json(r.body, r.status);
}

async function offer(ctx) {
  const { request, env } = ctx;
  if (request.method !== "GET") return json({ error: "method" }, 405);
  const mode = billingMode(env);
  if (mode === "off") return OFF();
  if (mode !== "live") {                         // test: the same page, for those billing is on for
    const user = env.DB ? await currentUser(request, env) : null;
    if (!user || !billingOn(env, user)) return OFF();
  }
  if (fromApp(request)) return json({ error: "app" }, 403);
  const [prices, pack, seller, changes] = await Promise.all([config(env, "prices"), packOf(env), config(env, "seller"), config(env, "changes")]);
  const plans = ["free", "plus", "club", "member", "participant", "u21"].map((id) => ({ id,
    caps: Object.fromEntries(Object.keys(CAPS).map((k) => [k, pack.caps[k][id]]).filter(([, v]) => v !== undefined)) }));
  // the seller's public identity for the terms of sale (never its bank details: those go on a club's own invoice)
  const PUBLIC = ["name", "form", "capital", "address", "country", "siren", "siret", "rcs", "vat", "vatNote", "email", "mediator", "mediatorUrl"];
  const pub = Object.fromEntries(PUBLIC.filter((k) => seller?.[k] != null && seller[k] !== "").map((k) => [k, seller[k]]));
  return json({ prices: displayPrices(prices), plans, caps: CAPS, capsText: Object.keys(CAPS), seller: pub, changes: Array.isArray(changes) ? changes : [] },
    200, { "Cache-Control": mode === "live" ? "public, max-age=300" : "no-store" });
}

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  const path = Array.isArray(params.path) ? params.path : params.path ? [params.path] : [];
  const op = path[0] || "";
  // the clubs' and the events' routes have their own files; nothing else lives deeper than one word
  if (op === "org" || op === "event" || path.length > 1) return json({ error: "not found" }, 404);
  // 1. the switch: off, nothing exists — whatever the route
  if (billingMode(env) === "off") return OFF();
  if (!env.DB) return json({ error: "server not configured" }, 500);
  try {
    if (op === "webhook") return await webhook(ctx);
    if (op === "offer") return await offer(ctx);

    // (test: only the accounts billing is on for; everyone else, signed in or not, as off)
    const user = await currentUser(request, env);
    if (user ? !billingOn(env, user) : billingMode(env) !== "live") return OFF();
    // 2. the migration
    if (!(await ready(env))) return json({ error: "not ready" }, 503);
    // 3. the session
    if (!user) return json({ error: "login required" }, 401);
    const method = request.method, subject = subjectOf(user);

    // the Ozimut app: the plan's state and nothing else (no price, no link, nothing to buy)
    if (fromApp(request)) return op === "" && method === "GET" ? json(await planOf(env, user)) : json({ error: "app" }, 403);

    if (op === "") return method === "GET" ? json(await stateOf(env, user)) : json({ error: "method" }, 405);
    if (method !== "POST") return json({ error: "method" }, 405);
    const b = (await readBody(request)) || {};
    const row = () => env.DB.prepare("SELECT * FROM subscriptions WHERE subject = ?").bind(subject).first();

    if (op === "seen") {
      const step = String(b.step || ""), k = String(b.k || "");
      if (!STEPS.has(step) || !/^[A-Za-z0-9_-]{0,32}$/.test(k)) return json({ error: "bad request" }, 400);
      if (!(await allow(env, `bill:seen:${clientIp(request)}`, 60, 3600))) return json({ error: "rate" }, 429);
      await funnel(env, step, k);
      return json({ ok: true });
    }

    if (op === "trial") {
      if (!(await allow(env, `bill:trial:${user.id}`, 5, 3600))) return json({ error: "rate" }, 429);
      const had = await env.DB.prepare("SELECT 1 AS x FROM grants WHERE subject = ? AND reason = 'trial' LIMIT 1").bind(subject).first();
      if (had) return json({ error: "used" }, 409);
      if (running(await row())) return json({ error: "subscribed" }, 409);
      const prices = await config(env, "prices"), days = Math.max(1, Math.min(366, Number(prices.trialDays) || 30));
      const until = addDays(today(), days);
      // (once ever, also when two requests cross: the grant is written only while the account has no trial)
      const put = await env.DB.prepare(`INSERT INTO grants (subject, plan, until, reason, note, by_user, created_at)
        SELECT ?, 'plus', ?, 'trial', '', ?, ? WHERE NOT EXISTS (SELECT 1 FROM grants WHERE subject = ? AND reason = 'trial')`)
        .bind(subject, until, user.id, nowIso(), subject).run();
      if (!(put.meta?.changes > 0)) return json({ error: "used" }, 409);
      changed();
      await funnel(env, "trial", "plus");
      ctx.waitUntil(sendBilling(env, user.email, trialStartMail(env, user, { until })).catch(() => {}));
      return json({ ok: true, until });
    }

    if (op === "code") {
      if (!(await allow(env, `bill:code:${user.id}`, 10, 3600))) return json({ error: "rate" }, 429);
      const code = normCode(b.code);
      if (!code || code.length > 64) return json({ error: "code" }, 404);
      const hash = await sha256hex(code), day = today();
      const c = await env.DB.prepare("SELECT * FROM billing_codes WHERE code_hash = ?").bind(hash).first();
      // (an individual's code gives « plus »; a club's plan is never granted to a person)
      if (!c || c.plan !== "plus" || !(c.days > 0)) return json({ error: "code" }, 404);
      if (await env.DB.prepare("SELECT 1 AS x FROM billing_code_uses WHERE code_hash = ? AND subject = ?").bind(hash, subject).first()) return json({ error: "used" }, 409);
      if (c.ended_at || (c.expires && c.expires < day) || c.uses >= c.max_uses) return json({ error: "code" }, 404);
      const until = addDays(day, Math.min(3660, c.days)), now = nowIso();
      const free = "EXISTS (SELECT 1 FROM billing_codes WHERE code_hash = ? AND uses < max_uses AND ended_at IS NULL)";
      const reason = ["founder", "gift", "staff", "pilot"].includes(c.reason) ? c.reason : "gift";
      // one batch (a transaction): the use, the grant and the count, each only while the code still has a use left
      let res;
      try {
        res = await env.DB.batch([
          env.DB.prepare(`INSERT INTO billing_code_uses (code_hash, subject, at) SELECT ?, ?, ? WHERE ${free}`).bind(hash, subject, now, hash),
          env.DB.prepare(`INSERT INTO grants (subject, plan, until, reason, note, by_user, created_at) SELECT ?, 'plus', ?, ?, ?, NULL, ? WHERE ${free}`)
            .bind(subject, until, reason, `code ${hash.slice(0, 8)}`, now, hash),
          env.DB.prepare("UPDATE billing_codes SET uses = uses + 1 WHERE code_hash = ? AND uses < max_uses AND ended_at IS NULL").bind(hash),
        ]);
      } catch (e) {
        if (/UNIQUE|constraint/i.test(String(e?.message || e))) return json({ error: "used" }, 409);
        throw e;
      }
      if (!(res[2].meta?.changes > 0)) return json({ error: "code" }, 404);
      changed();
      return json({ ok: true, plan: "plus", until });
    }

    // ---- from here on, Stripe
    if (!stripeReady(env)) return json({ error: "not configured" }, 503);

    if (op === "checkout" || op === "pack") {
      const prices = await config(env, "prices"), sell = await config(env, "sell");
      let priceId, founder = false;
      if (op === "checkout") {
        if (b.plan !== "plus") return json({ error: "bad request" }, 400);
        if (b.startNow !== true) return json({ error: "consent" }, 400);
        const p = prices.plus || {};
        founder = !!(p.founderUntil && p.founderUntil >= today() && p.stripe?.founder);
        priceId = founder ? p.stripe.founder : p.stripe?.year;
      } else {
        if (b.k !== "mapPack") return json({ error: "bad request" }, 400);
        priceId = prices.mapPack?.stripe;
      }
      if (!priceId) return json({ error: "no price" }, 503);
      const c = await countriesOf(env, request, user);
      if (!sellsTo(sell, c)) return json({ error: "country" }, 403);
      if (op === "checkout" && running(await row())) return json({ error: "subscribed" }, 409);
      if (!(await allow(env, `bill:co:${user.id}`, 6, 3600))) return json({ error: "rate" }, 429);
      const base = await sessionBase(env, user, c, sell);
      let session;
      if (op === "checkout") {
        session = await stripe(env, "POST", "/v1/checkout/sessions", { ...base, mode: "subscription",
          line_items: [{ price: priceId, quantity: 1 }],
          metadata: { subject, kind: "plus" },
          subscription_data: { metadata: { subject, plan: "plus" } } });
        // the buyer's express request to start during the withdrawal period, and where they buy from
        await env.DB.prepare("UPDATE billing_customers SET consent_at = ?, country = ? WHERE subject = ?").bind(nowIso(), c.country, subject).run();
        await funnel(env, "checkout", founder ? "founder" : "plus");
      } else {
        const n = Number(prices.mapPack.km2) || 0;
        if (!(n > 0)) return json({ error: "no price" }, 503);
        const meta = { subject, k: "genKm2", n };
        session = await stripe(env, "POST", "/v1/checkout/sessions", { ...base, mode: "payment",
          line_items: [{ price: priceId, quantity: 1 }], metadata: meta, payment_intent_data: { metadata: meta } });
        await env.DB.prepare("UPDATE billing_customers SET country = ? WHERE subject = ?").bind(c.country, subject).run();
        await funnel(env, "checkout", "mapPack");
      }
      if (!session?.url) return json({ error: "stripe", code: "no url" }, 502);
      return json({ url: session.url });
    }

    if (op === "portal") {
      const cust = await env.DB.prepare("SELECT stripe_customer FROM billing_customers WHERE subject = ?").bind(subject).first();
      if (!cust?.stripe_customer) return json({ error: "no customer" }, 404);
      if (!(await allow(env, `bill:portal:${user.id}`, 20, 3600))) return json({ error: "rate" }, 429);
      const s = await stripe(env, "POST", "/v1/billing_portal/sessions", { customer: cust.stripe_customer,
        return_url: `${siteUrl(env)}/#/reglages?onglet=abonnement`, locale: LOCALE[userLang(user)] || "auto" });
      return json({ url: s.url });
    }

    if (op === "cancel" || op === "resume") {
      const sub = await row();
      if (!running(sub) || !sub.stripe_sub) return json({ error: "no subscription" }, 404);
      if (!(await allow(env, `bill:cancel:${user.id}`, 12, 3600))) return json({ error: "rate" }, 429);
      await stripe(env, "POST", `/v1/subscriptions/${encodeURIComponent(sub.stripe_sub)}`, { cancel_at_period_end: op === "cancel" });
      // the row from a fresh read of Stripe; the e-mail from here or from the webhook's event, whichever sees the change (once)
      const s = await syncSubscription(env, sub.stripe_sub);
      ctx.waitUntil(transitions(env, s).catch(() => {}));
      if (op === "cancel") await funnel(env, "cancel", "plus");
      return json({ ok: true, cancelAtEnd: !!s?.row?.cancel_at_end, end: s?.row?.current_end || sub.current_end });
    }

    if (op === "withdraw") {
      const sub = await row();
      if (!running(sub) || !sub.stripe_sub) return json({ error: "no subscription" }, 404);
      if (!sub.first_paid_at || Date.now() > Date.parse(sub.first_paid_at) + WITHDRAW_DAYS * 86400e3) return json({ error: "late" }, 403);
      if (!(await allow(env, `bill:wd:${user.id}`, 4, 3600))) return json({ error: "rate" }, 429);
      const id = encodeURIComponent(sub.stripe_sub);
      const live = await stripe(env, "GET", `/v1/subscriptions/${id}`);
      const item = live.items?.data?.[0] || {};
      const from = Number(live.current_period_start ?? item.current_period_start), to = Number(live.current_period_end ?? item.current_period_end);
      // the share not used: the period's whole days left ÷ its days (the day of the withdrawal counts as used)
      const days = Math.round((to - from) / 86400), left = Math.max(0, Math.floor((to - Date.now() / 1000) / 86400));
      const share = days > 0 ? Math.min(1, left / days) : 0;
      // the last paid invoice: its amount × that share
      const inv = (await stripe(env, "GET", "/v1/invoices", { subscription: sub.stripe_sub, status: "paid", limit: 1 })).data?.[0];
      const paid = Number(inv?.amount_paid) || 0, refund = Math.min(paid, Math.round(paid * share));
      const pi = inv && (typeof inv.payment_intent === "string" ? inv.payment_intent : inv.payment_intent?.id);
      const ch = inv && (typeof inv.charge === "string" ? inv.charge : inv.charge?.id);
      let refunded = 0;
      if (refund > 0 && (pi || ch)) {
        const r = await stripe(env, "POST", "/v1/refunds", { ...(pi ? { payment_intent: pi } : { charge: ch }), amount: refund, reason: "requested_by_customer",
          metadata: { subject, why: "withdrawal" } }, { idem: `ozimut-withdraw-${sub.stripe_sub}` });
        refunded = Number(r.amount) || refund;
      }
      // (its own e-mail says the subscription ended: the webhook's « ended » one is not sent as well)
      await once(env, subject, "ended", sub.stripe_sub);
      await stripe(env, "DELETE", `/v1/subscriptions/${id}`, { prorate: false, invoice_now: false }, { idem: `ozimut-withdraw-end-${sub.stripe_sub}` });
      await syncSubscription(env, sub.stripe_sub);
      await funnel(env, "cancel", "withdraw");
      if (await once(env, subject, "withdrawn", sub.stripe_sub)) ctx.waitUntil(sendBilling(env, user.email, withdrawnMail(env, user, { refund: refunded, currency: inv?.currency || sub.currency })).catch(() => {}));
      return json({ ok: true, refund: refunded, currency: inv?.currency || sub.currency });
    }

    return json({ error: "not found" }, 404);
  } catch (e) {
    if (notReady(e)) return json({ error: "not ready" }, 503);
    const s = stripeError(e);
    if (s) return s;
    throw e;
  }
}
