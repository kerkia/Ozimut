// A stand-in for Stripe's API, for the local rehearsal of Ozimut's billing (docs/billing/design.md §11) — only the handful of
// endpoints functions/_lib/billing.js and functions/api/billing call, state in memory, no dependency.
//
//   node tools/billing/fake_stripe.mjs <port> <webhook url> <webhook secret>
//   e.g. node tools/billing/fake_stripe.mjs 8769 http://localhost:8762/api/billing/webhook whsec_fake
//
// Stripe's side:  POST /v1/customers · GET /v1/customers/<id> · POST|GET /v1/checkout/sessions[/<id>] ·
//                 GET /v1/subscriptions[/<id>] · POST /v1/subscriptions/<id> · DELETE /v1/subscriptions/<id> ·
//                 POST /v1/billing_portal/sessions · POST /v1/refunds · GET /v1/invoices[/<id>] · GET /v1/events/<id>
// The rehearsal's levers (what a buyer or time would do), each sending correctly signed events to the webhook:
//   POST /_fake/pay?session=cs_…    the Checkout session is paid (subscription: checkout.session.completed,
//                                   customer.subscription.created, invoice.paid; payment: checkout.session.completed)
//   POST /_fake/fail?sub=sub_…      a renewal's payment fails (invoice.payment_failed, customer.subscription.updated)
//   POST /_fake/renew?sub=sub_…     a year passes and the renewal is paid (invoice.paid, customer.subscription.updated)
//   POST /_fake/cancel?sub=sub_…    the subscription ends (customer.subscription.deleted)
//   POST /_fake/dispute?sub=sub_…   a dispute on its last charge (charge.dispute.created)
//   GET  /_fake/state               everything held (and each event's delivery status)
// A price's amount is read from its id's last number (« price_plus_year_2900 » → 2900 cents); 2900 without one.
// Nothing here is Stripe's code; it imitates the shapes of API version 2024-06-20 that Ozimut reads.

import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const YEAR = 365 * 86400;

/** « a[b][0]=1 » → { a: { b: ["1"] } } */
export function decodeForm(text) {
  const out = {};
  for (const pair of String(text || "").split("&")) {
    if (!pair) continue;
    const i = pair.indexOf("=");
    const dec = (s) => decodeURIComponent(s.replace(/\+/g, " "));
    const key = dec(i < 0 ? pair : pair.slice(0, i)), val = i < 0 ? "" : dec(pair.slice(i + 1));
    const path = [...key.matchAll(/([^[\]]+)|\[(.*?)\]/g)].map((m) => m[1] ?? m[2]);
    let o = out;
    path.forEach((k, n) => {
      if (n === path.length - 1) { o[k] = val; return; }
      if (o[k] === undefined || typeof o[k] !== "object") o[k] = /^\d+$/.test(path[n + 1]) ? [] : {};
      o = o[k];
    });
  }
  return out;
}

/**
 * The fake itself. deliver(event, header, body): how an event reaches the webhook (the server posts it; a test calls the
 * handler directly) — resolves with the answer's status. secret: the webhook's signing secret.
 */
export function createFake({ secret = "whsec_fake", deliver = async () => 0, origin = "http://127.0.0.1:8769", now = () => Math.floor(Date.now() / 1000) } = {}) {
  const S = { customers: {}, sessions: {}, subs: {}, invoices: {}, refunds: {}, events: {}, deliveries: [], n: 0, idem: {} };
  const id = (p) => `${p}_fake${String(++S.n).padStart(4, "0")}`;
  const amountOf = (price) => { const m = /(\d+)$/.exec(String(price || "")); return m ? Number(m[1]) : 2900; };
  const err = (status, code, message) => ({ status, json: { error: { type: "invalid_request_error", code, message } } });
  const list = (data) => ({ object: "list", data, has_more: false });

  function sign(body, t = now()) {
    return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
  }
  /** Make an event, keep it, send it. */
  async function emit(type, object, { send = true } = {}) {
    const ev = { id: id("evt"), object: "event", api_version: "2024-06-20", created: now(), type, data: { object: JSON.parse(JSON.stringify(object)) } };
    S.events[ev.id] = ev;
    if (send) await send_(ev);
    return ev;
  }
  async function send_(ev) {
    const body = JSON.stringify(ev);
    let status = 0;
    try { status = await deliver(ev, sign(body), body); } catch (e) { status = -1; }
    S.deliveries.push({ id: ev.id, type: ev.type, status });
    return status;
  }

  function newSub(session) {
    const price = session._price, t = now();
    const sub = { id: id("sub"), object: "subscription", customer: session.customer, status: "active", cancel_at_period_end: false,
      current_period_start: t, current_period_end: t + YEAR, created: t, start_date: t, ended_at: null, canceled_at: null,
      metadata: { ...(session._subMeta || {}) }, latest_invoice: null, currency: "eur",
      items: { object: "list", data: [{ id: id("si"), price: { id: price, unit_amount: amountOf(price), currency: "eur", recurring: { interval: "year" } }, quantity: 1 }] } };
    S.subs[sub.id] = sub;
    return sub;
  }
  function newInvoice(sub, { paid = true } = {}) {
    const amount = sub.items.data[0].price.unit_amount, t = now();
    const inv = { id: id("in"), object: "invoice", customer: sub.customer, subscription: sub.id, status: paid ? "paid" : "open",
      amount_due: amount, amount_paid: paid ? amount : 0, total: amount, currency: "eur", created: t, number: `FAKE-${String(S.n).padStart(4, "0")}`,
      charge: paid ? id("ch") : null, payment_intent: id("pi"), period_start: sub.current_period_start, period_end: sub.current_period_end,
      hosted_invoice_url: `${origin}/_fake/invoice/${S.n}`, invoice_pdf: `${origin}/_fake/invoice/${S.n}.pdf`,
      status_transitions: { paid_at: paid ? t : null }, attempt_count: paid ? 1 : 2, next_payment_attempt: paid ? null : t + 3 * 86400 };
    S.invoices[inv.id] = inv;
    sub.latest_invoice = inv.id;
    return inv;
  }

  const api = {
    "POST /v1/customers": (p) => {
      const c = { id: id("cus"), object: "customer", email: p.email || null, name: p.name || null, metadata: p.metadata || {}, preferred_locales: p.preferred_locales || [], created: now() };
      S.customers[c.id] = c;
      return c;
    },
    "GET /v1/customers/:id": (p, x) => S.customers[x] || err(404, "resource_missing", `No such customer: '${x}'`),
    "POST /v1/checkout/sessions": (p) => {
      if (!S.customers[p.customer]) return err(400, "resource_missing", `No such customer: '${p.customer}'`);
      const price = p.line_items?.[0]?.price;
      if (!price) return err(400, "parameter_missing", "Missing required param: line_items[0][price].");
      if (!["subscription", "payment"].includes(p.mode)) return err(400, "parameter_invalid", "Invalid mode");
      const s = { id: id("cs_test"), object: "checkout.session", mode: p.mode, customer: p.customer, status: "open", payment_status: "unpaid",
        client_reference_id: p.client_reference_id || null, metadata: p.metadata || {}, subscription: null, payment_intent: null,
        success_url: p.success_url, cancel_url: p.cancel_url, locale: p.locale || null, amount_total: amountOf(price), currency: "eur",
        consent_collection: p.consent_collection || null, custom_text: p.custom_text || null, created: now(),
        _price: price, _subMeta: p.subscription_data?.metadata || {}, _params: p };
      s.url = `${origin}/_fake/checkout/${s.id}`;
      S.sessions[s.id] = s;
      return s;
    },
    "GET /v1/checkout/sessions/:id": (p, x) => S.sessions[x] || err(404, "resource_missing", `No such checkout.session: '${x}'`),
    "GET /v1/subscriptions": (p) => list(Object.values(S.subs).filter((s) => (!p.customer || s.customer === p.customer)
      && (!p.status || p.status === "all" || s.status === p.status) && (p.status === "all" || p.status || s.status !== "canceled"))),
    "GET /v1/subscriptions/:id": (p, x) => S.subs[x] || err(404, "resource_missing", `No such subscription: '${x}'`),
    "POST /v1/subscriptions/:id": async (p, x) => {
      const s = S.subs[x];
      if (!s) return err(404, "resource_missing", `No such subscription: '${x}'`);
      if (s.status === "canceled") return err(400, "subscription_canceled", "A canceled subscription can only update its cancellation_details.");
      if (p.cancel_at_period_end !== undefined) s.cancel_at_period_end = p.cancel_at_period_end === "true";
      if (p.metadata) Object.assign(s.metadata, p.metadata);
      queue(() => emit("customer.subscription.updated", s));
      return s;
    },
    "DELETE /v1/subscriptions/:id": async (p, x) => {
      const s = S.subs[x];
      if (!s) return err(404, "resource_missing", `No such subscription: '${x}'`);
      if (s.status !== "canceled") {
        Object.assign(s, { status: "canceled", ended_at: now(), canceled_at: now(), cancel_at_period_end: false });
        queue(() => emit("customer.subscription.deleted", s));
      }
      return s;
    },
    "POST /v1/billing_portal/sessions": (p) => (S.customers[p.customer]
      ? { id: id("bps"), object: "billing_portal.session", customer: p.customer, return_url: p.return_url || null, url: `${origin}/_fake/portal/${p.customer}` }
      : err(400, "resource_missing", `No such customer: '${p.customer}'`)),
    "POST /v1/refunds": (p) => {
      const inv = Object.values(S.invoices).find((i) => (p.charge && i.charge === p.charge) || (p.payment_intent && i.payment_intent === p.payment_intent));
      if (!inv) return err(400, "resource_missing", "No such charge or payment intent");
      const amount = p.amount === undefined ? inv.amount_paid : Number(p.amount);
      const done = Object.values(S.refunds).filter((r) => r.charge === inv.charge).reduce((a, r) => a + r.amount, 0);
      if (!(amount > 0) || amount + done > inv.amount_paid) return err(400, "charge_already_refunded", "Refund amount is greater than the unrefunded amount");
      const r = { id: id("re"), object: "refund", amount, currency: "eur", charge: inv.charge, payment_intent: inv.payment_intent, status: "succeeded",
        reason: p.reason || null, metadata: p.metadata || {}, created: now() };
      S.refunds[r.id] = r;
      queue(() => emit("charge.refunded", { id: inv.charge, object: "charge", amount: inv.amount_paid, amount_refunded: amount + done, customer: inv.customer, invoice: inv.id, payment_intent: inv.payment_intent, refunded: amount + done === inv.amount_paid }));
      return r;
    },
    "GET /v1/invoices": (p) => list(Object.values(S.invoices).filter((i) => (!p.customer || i.customer === p.customer)
      && (!p.subscription || i.subscription === p.subscription) && (!p.status || i.status === p.status))
      .sort((a, b) => b.created - a.created || (a.id < b.id ? 1 : -1)).slice(0, Number(p.limit) || 10)),
    "GET /v1/invoices/:id": (p, x) => S.invoices[x] || err(404, "resource_missing", `No such invoice: '${x}'`),
    "GET /v1/events/:id": (p, x) => S.events[x] || err(404, "resource_missing", `No such event: '${x}'`),
  };

  // events caused by an API call leave after its answer, as Stripe's do
  let pending = [];
  const queue = (fn) => pending.push(fn);
  async function flush() { const q = pending; pending = []; for (const fn of q) await fn(); }

  const levers = {
    /** The buyer pays the Checkout session. */
    async pay({ session }) {
      const s = S.sessions[session];
      if (!s) return err(404, "no_session", "no such session");
      if (s.status === "complete") return { ok: true, already: true, subscription: s.subscription };
      Object.assign(s, { status: "complete", payment_status: "paid" });
      const events = [];
      if (s.mode === "subscription") {
        const sub = newSub(s), inv = newInvoice(sub);
        s.subscription = sub.id;
        events.push(await emit("checkout.session.completed", pub(s)), await emit("customer.subscription.created", sub), await emit("invoice.paid", inv));
      } else {
        s.payment_intent = id("pi");
        events.push(await emit("checkout.session.completed", pub(s)));
      }
      return { ok: true, subscription: s.subscription, events: events.map((e) => e.id) };
    },
    /** A renewal's payment fails. */
    async fail({ sub }) {
      const s = S.subs[sub];
      if (!s) return err(404, "no_sub", "no such subscription");
      s.status = "past_due";
      const inv = newInvoice(s, { paid: false });
      const a = await emit("invoice.payment_failed", inv), b = await emit("customer.subscription.updated", s);
      return { ok: true, invoice: inv.id, events: [a.id, b.id] };
    },
    /** A year passes; the renewal is paid. */
    async renew({ sub }) {
      const s = S.subs[sub];
      if (!s) return err(404, "no_sub", "no such subscription");
      if (s.status === "canceled") return err(400, "canceled", "the subscription has ended");
      Object.assign(s, { status: "active", current_period_start: s.current_period_end, current_period_end: s.current_period_end + YEAR });
      const inv = newInvoice(s);
      const a = await emit("invoice.paid", inv), b = await emit("customer.subscription.updated", s);
      return { ok: true, invoice: inv.id, events: [a.id, b.id] };
    },
    /** The subscription ends (its period's end after a termination, or Stripe giving up on a payment). */
    async cancel({ sub }) {
      const s = S.subs[sub];
      if (!s) return err(404, "no_sub", "no such subscription");
      Object.assign(s, { status: "canceled", ended_at: now(), canceled_at: now() });
      const a = await emit("customer.subscription.deleted", s);
      return { ok: true, events: [a.id] };
    },
    async dispute({ sub }) {
      const s = S.subs[sub], inv = s && S.invoices[s.latest_invoice];
      if (!inv?.charge) return err(404, "no_charge", "no paid invoice");
      const a = await emit("charge.dispute.created", { id: id("dp"), object: "dispute", charge: inv.charge, amount: inv.amount_paid, currency: "eur", reason: "general", status: "needs_response" });
      return { ok: true, events: [a.id] };
    },
  };
  const pub = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("_")));

  /** One request: → { status, json } or { status, html }. Events it causes are sent by flush(), after the answer. */
  async function handle(method, url, headers = {}, bodyText = "") {
    const u = new URL(url, origin), path = u.pathname.replace(/\/+$/, "");
    if (path.startsWith("/_fake/")) {
      const name = path.split("/")[2], q = Object.fromEntries(u.searchParams);
      if (name === "state" && method === "GET") return { status: 200, json: { customers: S.customers, sessions: Object.values(S.sessions).map(pub), subscriptions: S.subs, invoices: S.invoices, refunds: S.refunds, deliveries: S.deliveries } };
      if (levers[name] && method === "POST") { const r = await levers[name](q); return r.status ? r : { status: 200, json: r }; }
      if (method === "GET") return { status: 200, html: `<!doctype html><meta charset="utf-8"><title>Fake Stripe</title><p>Fake Stripe page: <code>${path.replace(/[<&]/g, "")}</code>. Nothing is paid here; use the <code>/_fake/…</code> levers.</p>` };
      return err(404, "not_found", "unknown lever");
    }
    if (!/^Bearer \S+/.test(headers.authorization || headers.Authorization || "")) return err(401, "api_key_missing", "You did not provide an API key.");
    const idem = headers["idempotency-key"] || headers["Idempotency-Key"];
    if (method !== "GET" && idem && S.idem[idem]) return S.idem[idem];
    const params = method === "GET" ? decodeForm(u.search.slice(1)) : decodeForm(bodyText);
    let fn = api[`${method} ${path}`], arg;
    if (!fn) {
      const m = /^(.*)\/([^/]+)$/.exec(path);
      if (m) { fn = api[`${method} ${m[1]}/:id`]; arg = m[2]; }
    }
    if (!fn) return err(404, "unknown_url", `Unrecognized request URL (${method}: ${path}). The fake knows only what Ozimut calls.`);
    const r = await fn(params, arg);
    const out = r && r.status && r.json ? r : { status: 200, json: pub(r) };
    if (method !== "GET" && idem) S.idem[idem] = out;
    return out;
  }
  return { handle, flush, state: S, sign, emit, levers, resend: (evId) => send_(S.events[evId]) };
}

// ---- the server
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const port = Number(process.argv[2]) || 8769, hook = process.argv[3] || "", secret = process.argv[4] || "whsec_fake";
  const fake = createFake({
    secret, origin: `http://127.0.0.1:${port}`,
    deliver: async (ev, header, body) => {
      if (!hook) return 0;
      const r = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": header }, body });
      console.log(`[fake stripe] ${ev.type} ${ev.id} → ${r.status}`);
      return r.status;
    },
  });
  createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    let r;
    try { r = await fake.handle(req.method, req.url, req.headers, body); }
    catch (e) { r = { status: 500, json: { error: { type: "api_error", code: "fake", message: String(e?.message || e) } } }; }
    res.writeHead(r.status, { "Content-Type": r.html ? "text/html; charset=utf-8" : "application/json" });
    res.end(r.html || JSON.stringify(r.json));
    if (!req.url.startsWith("/_fake/")) console.log(`[fake stripe] ${req.method} ${req.url.split("?")[0]} → ${r.status}`);
    fake.flush().catch((e) => console.log(`[fake stripe] event not delivered: ${e?.message || e}`));
  }).listen(port, "127.0.0.1", () => console.log(`[fake stripe] http://127.0.0.1:${port} — events to ${hook || "(nowhere)"}`));
}
