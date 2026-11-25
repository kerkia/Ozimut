// /api/billing/event/<event id> — one event bought by the unit (docs/billing/design.md §6; migration 0034): the event's team
// opens for that event what the Club plan holds (a grant « e<id> », reason « event », until the event's day + 30); after the
// event an administrator's « Facturer » (functions/api/admin/billing.js, op invoice.event) makes the invoice to the event's club
// from its entries: min(entries × prices.event.perEntry, prices.event.cap).
//
// In this order: 404 { error: "off" } unless billing is on for the account; 503 { error: "not ready" } before migration 0034;
// 401 { error: "login required" }; 404 { error: "not found" } for an unknown event; 403 { error: "forbidden" } unless the account
// is on the event's team (_lib/entries.js teamMay: the team, its club's organisers, an administrator).
//
//   GET  /api/billing/event/<id>
//     -> { event: { id, name, date, type },
//          org: { id, name } | null,                 // the club the invoice will go to
//          bought: bool,                             // a grant in force for this event
//          grant: { id, until, since, ended } | null,
//          covered: bool, by: "<name>",              // the club's own plan (or its federation's) already gives it: nothing to buy
//          price: { perEntry, cap, currency },       // cents
//          entries: n, estimate: cents,              // entries not cancelled, and what they make today
//          billingOk: bool,                          // the club's billing details hold a name and an address
//          invoice: brief | null }                   // once invoiced (brief as in /api/billing/org)
//   POST /api/billing/event/<id>          (no body)
//     -> { ok: true, existing: bool, grant: { id, until, since, ended: false }, until }
//        409 { error: "covered", by } (the club's plan already gives it) | { error: "over" } (the event is more than 30 days past)
//        400 { error: "org" } (no club is known for the event: nobody to invoice)

import { currentUser, json } from "../../../_lib/api.js";
import { loadEvent, teamMay } from "../../../_lib/entries.js";
import { addDays, brief, buyerComplete, eventDue, eventGrant, eventInvoice, orgBilling } from "../../../_lib/invoices.js";
import { orgOfEvent } from "../../../_lib/orgs.js";
import { addGrant, billingMode, billingOn, notReady, orgPlan, ready, today } from "../../../_lib/plans.js";

export async function onRequest(ctx) {
  const { request, env } = ctx;
  if (billingMode(env) === "off" || !env.DB) return json({ error: "off" }, 404);
  const user = await currentUser(request, env);
  if (!billingOn(env, user)) return json({ error: "off" }, 404);
  if (!(await ready(env))) return json({ error: "not ready" }, 503);
  if (!user) return json({ error: "login required" }, 401);
  try { return await route(ctx, user); }
  catch (e) { if (notReady(e)) return json({ error: "not ready" }, 503); throw e; }
}

const grantView = (g) => (g ? { id: g.id, until: g.until || null, since: String(g.created_at || "").slice(0, 10), ended: !!g.ended_at } : null);
const live = (g, day) => !!g && !g.ended_at && (!g.until || g.until >= day);

async function route({ request, env, params }, user) {
  const path = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  if (path.length !== 1 || !/^[\w-]{1,40}$/.test(path[0])) return json({ error: "not found" }, 404);
  const ev = await loadEvent(env, path[0]);
  if (!ev) return json({ error: "not found" }, 404);
  if (!(await teamMay(env, request, user, ev))) return json({ error: "forbidden" }, 403);
  const org = await orgOfEvent(env, request, ev).catch(() => null);
  const day = today(), grant = await eventGrant(env, ev.id), plan = org ? await orgPlan(env, org.id) : { plan: null, name: "" };

  if (request.method === "GET") {
    const due = await eventDue(env, ev.id), inv = await eventInvoice(env, ev.id);
    return json({
      event: { id: ev.id, name: ev.name, date: ev.date, type: ev.type }, org: org ? { id: org.id, name: org.name } : null,
      bought: live(grant, day), grant: grantView(grant), covered: !!plan.plan, by: plan.plan ? plan.name || "" : "",
      price: { perEntry: due.perEntry, cap: due.cap, currency: due.currency }, entries: due.entries, estimate: due.amount,
      billingOk: org ? buyerComplete(await orgBilling(env, org.id)) : false, invoice: inv ? brief(inv) : null,
    });
  }
  if (request.method === "POST") {
    if (grant && !grant.ended_at) return json({ ok: true, existing: true, grant: grantView(grant), until: grant.until || null });   // bought once
    if (plan.plan) return json({ error: "covered", by: plan.name || "" }, 409);
    if (!org) return json({ error: "org" }, 400);
    const until = addDays(ev.date, 30);
    if (until < day) return json({ error: "over" }, 409);
    const id = await addGrant(env, { subject: `e${ev.id}`, plan: "club", until, reason: "event", note: ev.name, by: user.id });
    return json({ ok: true, existing: false, grant: { id, until, since: day, ended: false }, until });
  }
  return json({ error: "method not allowed" }, 405);
}
