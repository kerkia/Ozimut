// /api/billing/org/<org id> — a club as Ozimut's customer (docs/billing/design.md §6; migration 0034, functions/_lib/invoices.js):
// the « Ozimut Club » plan ordered by its managers or treasurers and paid by bank transfer on an invoice. No Stripe here.
//
// Every route, in this order: 404 { error: "off" } unless billing is on for the account (_lib/plans.js billingOn; without a
// session too, unless the mode is live); 503 { error: "not ready" } before migration 0034 (or 0030); 401 { error: "login
// required" }; 404 { error: "not found" } for an unknown org; 403 { error: "forbidden" } unless the account is a manager or a
// treasurer of the org (_lib/orgs.js can "manage" | "treasure"), or an administrator.
//
//   GET  /api/billing/org/<id>
//     -> { org: { id, name, kind, cc, code },
//          plan: "club" | null, until: "YYYY-MM-DD" | null, why: { kind: "sub" | "grant", reason, id, scope: "club" | "federation" } | null,
//          by: "<name of what gives the plan>",            // the club itself, a league, a country code
//          sub: { status, current_start, current_end, amount, currency, invoice_id } | null,   // its own year paid by transfer
//          trust: { until } | null,                         // the plan running on trust (an order not paid yet)
//          billing: { name, address, country, siret, vat_id, email, updated_at, set, complete },
//          price: { amount, small, year, smallAmount, smallMax, members, currency, vatRate, vatNote },   // cents
//          members: n,                                      // members in force
//          canOrder: bool, blocked: "" | "active" | "unpaid" | "billing" | "seller",
//          seller: { name, iban, bic, email },              // where to pay (what is public on an invoice)
//          invoices: [brief],                               // invoices, credit notes and quotes, the latest first
//          eventsUnit: [{ event, name, date, until, since, ended, entries, estimate, invoice: brief | null }] }
//     brief = { id, number, kind: invoice|credit|quote, subject, org_id, net, vat, total, currency, status: draft|issued|paid|cancelled,
//               issued_at, due_at, paid_at, paid_how, of_invoice, plan, period_from, period_to, buyer, label, note, reminded }
//   PUT  /api/billing/org/<id>          { billing: { name, address, country, siret, vat_id, email } }
//     -> { ok: true, billing }            400 { error: "bad request" }
//   POST /api/billing/org/<id>/quote    { plan: "club" }
//     -> { ok: true, quote: record }      (kind quote, no number, status draft, due_at = its last valid day, 60 days)
//        400 { error: "plan" }, 429 { error: "rate" }
//   POST /api/billing/org/<id>/order    { plan: "club" }
//     -> { ok: true, invoice: record, plan: "club", until: "YYYY-MM-DD" (the trust's last day), mailed: n }
//        400 { error: "plan" } | { error: "billing" } (the billing details lack a name or an address)
//        409 { error: "active", plan, until } (a plan is already in force) | { error: "unpaid", invoice: brief } (an issued, unpaid
//        invoice for the same plan) ; 503 { error: "seller" } (Ozimut's own identity is not filled in yet)
//   GET  /api/billing/org/<id>/invoice/<invoice id>
//     -> { invoice: record }              404 { error: "not found" }
//   record = { id, number, kind, subject, org_id, lines: [{ label, qty, unit, amount, k }], net, vat, total, currency, status,
//              issued_at, due_at, paid_at, paid_how, ref, of_invoice, plan, period_from, period_to,
//              seller: { name, form, capital, address, country, siren, siret, rcs, vat, vatNote, iban, bic, email, mediator, mediatorUrl },
//              buyer: { org, name, address, country, siret, vat_id, email }, note, reminded, created_at, vat_rate }
//   Amounts are integers in cents; days « YYYY-MM-DD ».

import { allow, currentUser, json, readBody } from "../../../_lib/api.js";
import {
  TRUST_DAYS, addDays, brief, buyerComplete, cleanBilling, clubLine, clubPrice, eventDue, invoiceById, issue, officersOf, orgBilling, parsed, quote,
  saveOrgBilling, sellerComplete, yearEnd,
} from "../../../_lib/invoices.js";
import { sendBilling } from "../../../_lib/billing.js";
import { can, orgById, ready as orgsReady } from "../../../_lib/orgs.js";
import { addGrant, billingMode, billingOn, config, notReady, orgPlan, ready, today } from "../../../_lib/plans.js";
import { clubInvoiceMail } from "../../../_lib/templates.js";

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (billingMode(env) === "off" || !env.DB) return json({ error: "off" }, 404);
  const user = await currentUser(request, env);
  if (!billingOn(env, user)) return json({ error: "off" }, 404);
  if (!(await ready(env)) || !(await orgsReady(env))) return json({ error: "not ready" }, 503);
  if (!user) return json({ error: "login required" }, 401);
  try { return await route(ctx, user); }
  catch (e) { if (notReady(e)) return json({ error: "not ready" }, 503); throw e; }
}

async function route({ request, env, params }, user) {
  const path = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const org = await orgById(env, path[0]);
  if (!org) return json({ error: "not found" }, 404);
  if (!(await can(env, user, org.id, "manage")) && !(await can(env, user, org.id, "treasure"))) return json({ error: "forbidden" }, 403);
  const method = request.method, sub = path[1] || "", subject = `o${org.id}`;

  if (!sub && method === "GET") return json(await state(env, org));

  if (!sub && method === "PUT") {
    const b = cleanBilling((await readBody(request))?.billing);
    if (!b) return json({ error: "bad request" }, 400);
    await saveOrgBilling(env, org.id, b, user.id);
    const saved = await orgBilling(env, org.id);
    return json({ ok: true, billing: { ...saved, complete: buyerComplete(saved) } });
  }

  if (sub === "quote" && method === "POST" && path.length === 2) {
    const b = await readBody(request);
    if ((b?.plan || "club") !== "club") return json({ error: "plan" }, 400);
    if (!(await allow(env, `bill:quote:${org.id}`, 10, 86400))) return json({ error: "rate" }, 429);
    const price = await clubPrice(env, org.id), from = today(), to = yearEnd(from);
    const r = await quote(env, { subject, orgId: org.id, lines: [clubLine(price, from, to)], plan: "club", periodFrom: from, periodTo: to, by: user.id });
    if (r.error) return json({ error: r.error }, 400);
    return json({ ok: true, quote: r.invoice });
  }

  if (sub === "order" && method === "POST" && path.length === 2) {
    const b = await readBody(request);
    if (b?.plan !== "club") return json({ error: "plan" }, 400);
    const has = await orgPlan(env, org.id);
    if (has.plan) return json({ error: "active", plan: has.plan, until: has.until }, 409);
    const open = await env.DB.prepare("SELECT * FROM invoices WHERE subject = ? AND kind = 'invoice' AND status = 'issued' AND plan = 'club' ORDER BY id DESC LIMIT 1").bind(subject).first();
    if (open) return json({ error: "unpaid", invoice: brief(open) }, 409);
    if (!buyerComplete(await orgBilling(env, org.id))) return json({ error: "billing" }, 400);
    const price = await clubPrice(env, org.id), from = today(), to = yearEnd(from);
    const r = await issue(env, { subject, orgId: org.id, lines: [clubLine(price, from, to)], plan: "club", periodFrom: from, periodTo: to, by: user.id });
    if (r.error === "seller") return json({ error: "seller" }, 503);
    if (r.error) return json({ error: r.error }, 400);
    const until = addDays(from, TRUST_DAYS);
    await addGrant(env, { subject, plan: "club", until, reason: "trust", note: r.invoice.number, by: user.id });
    let mailed = 0;
    for (const u of await officersOf(env, org.id)) {
      const m = clubInvoiceMail(env, u, { club: org.name, invoice: r.invoice, org: org.id });
      try { await sendBilling(env, u.email, m); mailed += 1; } catch (e) { /* the invoice stands */ }
    }
    return json({ ok: true, invoice: r.invoice, plan: "club", until, mailed });
  }

  if (sub === "invoice" && method === "GET" && path.length === 3) {
    const inv = await invoiceById(env, path[2]);
    if (!inv || inv.org_id !== org.id) return json({ error: "not found" }, 404);
    return json({ invoice: parsed(inv) });
  }
  return json({ error: "not found" }, 404);
}

async function state(env, org) {
  const subject = `o${org.id}`, day = today();
  const [plan, billing, price, seller] = [await orgPlan(env, org.id), await orgBilling(env, org.id), await clubPrice(env, org.id), await config(env, "seller")];
  const [inv, sub, trust, evs] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM invoices WHERE org_id = ? OR subject = ? ORDER BY id DESC LIMIT 200").bind(org.id, subject),
    env.DB.prepare("SELECT status, current_start, current_end, amount, currency, invoice_id, ended_at FROM subscriptions WHERE subject = ?").bind(subject),
    env.DB.prepare("SELECT until FROM grants WHERE subject = ? AND reason = 'trust' AND ended_at IS NULL AND (until IS NULL OR until >= ?) ORDER BY id DESC LIMIT 1").bind(subject, day),
    env.DB.prepare(`SELECT e.id, e.name, e.date, g.until, g.created_at, g.ended_at FROM events e JOIN grants g ON g.subject = 'e' || e.id AND g.reason = 'event'
      WHERE e.org_id = ? AND e.status = 'active' ORDER BY e.date DESC LIMIT 100`).bind(org.id),
  ]);
  const rows = inv.results || [];
  const eventsUnit = [];
  for (const e of evs.results || []) {
    const due = await eventDue(env, e.id);
    const its = rows.find((r) => r.subject === `e${e.id}` && r.kind === "invoice" && r.status !== "cancelled");
    eventsUnit.push({ event: e.id, name: e.name, date: e.date, until: e.until || null, since: String(e.created_at || "").slice(0, 10), ended: !!e.ended_at,
      entries: due.entries, estimate: due.amount, invoice: its ? brief(its) : null });
  }
  const s = sub.results?.[0], live = s && !s.ended_at && s.status === "active" && (!s.current_end || s.current_end >= day);
  const unpaid = rows.find((r) => r.subject === subject && r.kind === "invoice" && r.status === "issued" && r.plan === "club");
  const complete = buyerComplete(billing);
  const blocked = plan.plan ? "active" : unpaid ? "unpaid" : !complete ? "billing" : !sellerComplete(seller) ? "seller" : "";
  return {
    org: { id: org.id, name: org.name, kind: org.kind, cc: org.cc, code: org.code },
    plan: plan.plan, until: plan.until, why: plan.why, by: plan.name || "",
    sub: live ? { status: s.status, current_start: s.current_start, current_end: s.current_end, amount: s.amount, currency: s.currency, invoice_id: s.invoice_id } : null,
    trust: trust.results?.[0] ? { until: trust.results[0].until || null } : null,
    billing: { ...billing, complete }, price, members: price.members, canOrder: !blocked, blocked,
    seller: { name: seller.name || "", iban: seller.iban || "", bic: seller.bic || "", email: seller.email || "" },
    invoices: rows.map(brief), eventsUnit,
  };
}
