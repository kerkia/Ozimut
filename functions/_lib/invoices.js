// Ozimut's own invoices to clubs, leagues and federations (docs/billing/design.md §6; migration 0034): paid by bank
// transfer, no Stripe. Used by functions/api/billing/org, functions/api/billing/event and functions/api/admin/billing.js.
//
// The rules a French invoice follows:
//   - one series for invoices and credit notes, « OZ-<year>-<nnnn> », sequential WITHOUT gaps: the number is taken in the same
//     D1 batch (one transaction) as the row that carries it, so a failed insert takes no number; quotes take none;
//   - an issued invoice is never modified: its lines, totals, seller and buyer are written once (the seller and the buyer as
//     they were that day, as JSON in the row); only its status, payment and reminder fields move. A correction is a credit
//     note (a row of kind « credit » with the opposite lines and a number of its own), which cancels the invoice.
//
// Amounts are integers in cents. A record as the routes return it (`parsed`):
//   { id, number, kind: invoice|credit|quote, subject, org_id, lines: [{ label, qty, unit, amount, k }], net, vat, total,
//     currency, status: draft|issued|paid|cancelled, issued_at, due_at, paid_at, paid_how, ref (= number), of_invoice, plan,
//     period_from, period_to, seller: {…}, buyer: { org, name, address, country, siret, vat_id, email }, note, reminded,
//     created_at, vat_rate }
// Days are « YYYY-MM-DD » (Paris); created_at an ISO time.

import { nowIso } from "./api.js";
import { changed, config, today } from "./plans.js";

export const DUE_DAYS = 30;        // an invoice is due 30 days after it is issued
export const QUOTE_DAYS = 60;      // a quote is valid 60 days (kept in due_at)
export const TRUST_DAYS = 30;      // the plan runs on trust that long after the order
const MAX_LINES = 40;

const text = (s, max) => String(s ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
/** A day moved by n days. */
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** The last day of the year starting on `day` (2026-11-25 → 2027-11-24). */
export function yearEnd(day) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
/** Rounded to the nearest integer, a half away from zero (−0.5 → −1). */
export const roundHalf = (x) => (x < 0 ? -Math.round(-x) : Math.round(x));
const pad4 = (n) => String(n).padStart(4, "0");
export const numberOf = (year, n) => `OZ-${year}-${pad4(n)}`;

/**
 * The next number of the year's series, taken atomically (one statement). Only for a caller that issues at once in its own
 * transaction: `issue` and `creditNote` take theirs inside the batch that writes the row, so that no number is ever lost.
 */
export async function nextNumber(env, year) {
  const y = Number(year);
  const row = await env.DB.prepare("INSERT INTO invoice_seq (year, n) VALUES (?, 1) ON CONFLICT (year) DO UPDATE SET n = n + 1 RETURNING n").bind(y).first();
  return numberOf(y, row.n);
}

/** Lines as they are stored: [{ label, qty, unit (cents), amount (cents), k }] — amount = qty × unit unless given. */
export function cleanLines(lines) {
  if (!Array.isArray(lines) || !lines.length || lines.length > MAX_LINES) return null;
  const out = [];
  for (const l of lines) {
    const label = text(l?.label, 300), qty = l?.qty === undefined ? 1 : Number(l.qty), unit = Number(l?.unit);
    if (!label || !Number.isFinite(qty) || !Number.isInteger(unit)) return null;
    const amount = l.amount === undefined ? roundHalf(qty * unit) : Number(l.amount);
    if (!Number.isInteger(amount) || Math.abs(amount) > 1e10) return null;
    out.push({ label, qty, unit, amount, k: text(l.k, 60) });
  }
  return out;
}

/** The VAT rate as a percentage: seller.vat is « 20 » (or « 0.2 », read as 20 %); 0 under the franchise. */
export function vatRateOf(seller) {
  const r = Number(seller?.vat);
  if (!Number.isFinite(r) || r <= 0) return 0;
  return r < 1 ? r * 100 : r;
}
/** { net, vat, total } in cents from the lines' amounts; vatRate a percentage; the VAT rounded half away from zero. */
export function totals(lines, vatRate = 0) {
  const net = (lines || []).reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const vat = roundHalf(net * (Number(vatRate) || 0) / 100);
  return { net, vat, total: net + vat };
}

/** Is the seller's identity enough to issue an invoice (a name, an address, a SIREN or SIRET)? */
export const sellerComplete = (s) => !!(text(s?.name, 200) && text(s?.address, 500) && (text(s?.siren, 20) || text(s?.siret, 20)));
/** Is the buyer's enough (a name and an address)? */
export const buyerComplete = (b) => !!(text(b?.name, 200) && text(b?.address, 500));

const BILLING_FIELDS = { name: 200, address: 500, country: 2, siret: 20, vat_id: 20, email: 254 };
/** A club's billing details (org_billing), every field a string; `set` false when never filled. */
export async function orgBilling(env, orgId) {
  const r = await env.DB.prepare("SELECT name, address, country, siret, vat_id, email, updated_at FROM org_billing WHERE org_id = ?").bind(Number(orgId)).first();
  return { name: r?.name || "", address: r?.address || "", country: r?.country || "", siret: r?.siret || "", vat_id: r?.vat_id || "", email: r?.email || "",
    updated_at: r?.updated_at || null, set: !!r };
}
/** Clean { name, address, country, siret, vat_id, email } from a body; null when a field is not acceptable. */
export function cleanBilling(b) {
  if (!b || typeof b !== "object") return null;
  const out = {};
  for (const [k, max] of Object.entries(BILLING_FIELDS)) {
    if (b[k] !== undefined && typeof b[k] !== "string") return null;
    out[k] = text(b[k], max);
  }
  out.country = out.country.toUpperCase();
  if (out.country && !/^[A-Z]{2}$/.test(out.country)) return null;
  out.siret = out.siret.replace(/\s+/g, "");
  out.vat_id = out.vat_id.replace(/\s+/g, "").toUpperCase();
  if (out.email && !/^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/.test(out.email)) return null;
  return out;
}
export async function saveOrgBilling(env, orgId, b, userId) {
  await env.DB.prepare(`INSERT INTO org_billing (org_id, name, address, country, siret, vat_id, email, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (org_id) DO UPDATE SET name = excluded.name, address = excluded.address, country = excluded.country, siret = excluded.siret,
      vat_id = excluded.vat_id, email = excluded.email, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(Number(orgId), b.name, b.address, b.country, b.siret, b.vat_id, b.email, nowIso(), userId || null).run();
}

const json = (s, d) => { try { const v = JSON.parse(s || ""); return v && typeof v === "object" ? v : d; } catch (e) { return d; } };
/** A row as the routes return it: its JSON columns parsed, `ref` its number, `vat_rate` the rate it was issued at. */
export function parsed(row) {
  if (!row) return null;
  const seller = json(row.seller, {}), lines = json(row.lines, []);
  return { id: row.id, number: row.number || null, kind: row.kind, subject: row.subject, org_id: row.org_id ?? null, lines: Array.isArray(lines) ? lines : [],
    net: row.net, vat: row.vat, total: row.total, currency: row.currency, status: row.status, issued_at: row.issued_at || null, due_at: row.due_at || null,
    paid_at: row.paid_at || null, paid_how: row.paid_how || "", ref: row.number || null, of_invoice: row.of_invoice ?? null, plan: row.plan || "",
    period_from: row.period_from || null, period_to: row.period_to || null, seller, buyer: json(row.buyer, {}), note: row.note || "",
    reminded: row.reminded || 0, created_at: row.created_at, vat_rate: vatRateOf(seller) };
}
/** The short form for lists (no seller, buyer's name only). */
export const brief = (row) => {
  const p = parsed(row);
  return p && { id: p.id, number: p.number, kind: p.kind, subject: p.subject, org_id: p.org_id, net: p.net, vat: p.vat, total: p.total, currency: p.currency,
    status: p.status, issued_at: p.issued_at, due_at: p.due_at, paid_at: p.paid_at, paid_how: p.paid_how, of_invoice: p.of_invoice, plan: p.plan,
    period_from: p.period_from, period_to: p.period_to, buyer: p.buyer.name || p.buyer.org || "", label: p.lines[0]?.label || "", note: p.note, reminded: p.reminded };
};
export const invoiceById = async (env, id) => (Number.isInteger(Number(id)) && Number(id) > 0
  ? (await env.DB.prepare("SELECT * FROM invoices WHERE id = ?").bind(Number(id)).first()) || null : null);

/** The seller and the buyer as they are today, for the row: { seller, buyer, currency }. */
async function parties(env, orgId) {
  const [seller, prices] = [await config(env, "seller"), await config(env, "prices")];
  let buyer = {};
  if (orgId) {
    const org = await env.DB.prepare("SELECT name FROM orgs WHERE id = ?").bind(Number(orgId)).first();
    const b = await orgBilling(env, orgId);
    buyer = { org: org?.name || "", name: b.name, address: b.address, country: b.country, siret: b.siret, vat_id: b.vat_id, email: b.email };
  }
  return { seller: seller && typeof seller === "object" ? seller : {}, buyer, currency: String(prices?.currency || "eur").toLowerCase() };
}

const INSERT = `INSERT INTO invoices (number, kind, subject, org_id, lines, net, vat, total, currency, status, issued_at, due_at, of_invoice, plan,
  period_from, period_to, seller, buyer, note, by_user, created_at)`;
// the number of the row being written, from the sequence the statement before it in the batch moved (the year bound as text:
// a number would be written « 2026.0 »)
const NUMBER = "'OZ-' || ? || '-' || printf('%04d', (SELECT n FROM invoice_seq WHERE year = ?))";
const SEQ = "INSERT INTO invoice_seq (year, n) VALUES (?, 1) ON CONFLICT (year) DO UPDATE SET n = n + 1";

/**
 * Issue an invoice now: numbered, its seller and buyer frozen, due in 30 days.
 * → { invoice } or { error: "lines" | "seller" (the seller's identity is incomplete) | "billing" (the buyer's is) | "period" }.
 */
export async function issue(env, { subject, orgId = null, lines, plan = "", periodFrom = null, periodTo = null, note = "", by = null, kind = "invoice" }) {
  if (kind === "quote") return quote(env, { subject, orgId, lines, plan, periodFrom, periodTo, note, by });
  if (kind !== "invoice") return { error: "kind" };
  const ls = cleanLines(lines);
  if (!ls || !subject) return { error: "lines" };
  if ((periodFrom && !isDay(periodFrom)) || (periodTo && !isDay(periodTo)) || (plan && !(periodFrom && periodTo))) return { error: "period" };
  const { seller, buyer, currency } = await parties(env, orgId);
  if (!sellerComplete(seller)) return { error: "seller" };
  if (!buyerComplete(buyer)) return { error: "billing" };
  const t = totals(ls, vatRateOf(seller)), day = today(), year = Number(day.slice(0, 4));
  const res = await env.DB.batch([
    env.DB.prepare(SEQ).bind(year),
    env.DB.prepare(`${INSERT} VALUES (${NUMBER}, 'invoice', ?, ?, ?, ?, ?, ?, ?, 'issued', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
      .bind(String(year), year, String(subject), orgId ? Number(orgId) : null, JSON.stringify(ls), t.net, t.vat, t.total, currency, day, addDays(day, DUE_DAYS),
        text(plan, 20), periodFrom, periodTo, JSON.stringify(seller), JSON.stringify(buyer), text(note, 1000), by || null, nowIso()),
  ]);
  return { invoice: parsed(res[1].results[0]) };
}

/** A quote: kind « quote », no number, status draft, valid 60 days (due_at). → { invoice } or { error: "lines" }. */
export async function quote(env, { subject, orgId = null, lines, plan = "", periodFrom = null, periodTo = null, note = "", by = null }) {
  const ls = cleanLines(lines);
  if (!ls || !subject) return { error: "lines" };
  const { seller, buyer, currency } = await parties(env, orgId);
  const t = totals(ls, vatRateOf(seller)), day = today();
  const row = await env.DB.prepare(`${INSERT} VALUES (NULL, 'quote', ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`)
    .bind(String(subject), orgId ? Number(orgId) : null, JSON.stringify(ls), t.net, t.vat, t.total, currency, day, addDays(day, QUOTE_DAYS),
      text(plan, 20), isDay(periodFrom) ? periodFrom : null, isDay(periodTo) ? periodTo : null, JSON.stringify(seller), JSON.stringify(buyer),
      text(note, 1000), by || null, nowIso()).first();
  return { invoice: parsed(row) };
}

/**
 * A credit note for an issued or paid invoice: a row of kind « credit » with the opposite lines, the invoice's own seller and
 * buyer, a number of its own; the invoice becomes « cancelled », and what its payment (or its order, on trust) opened is
 * closed. All in one transaction, and only once: a second call finds the invoice cancelled and takes no number.
 * → { credit, invoice } or { error: "not found" | "state" }.
 */
export async function creditNote(env, invoiceId, by = null, note = "") {
  const inv = await invoiceById(env, invoiceId);
  if (!inv || inv.kind !== "invoice") return { error: "not found" };
  if (!["issued", "paid"].includes(inv.status)) return { error: "state" };
  const lines = json(inv.lines, []).map((l) => ({ ...l, unit: -l.unit, amount: -l.amount }));
  const day = today(), year = Number(day.slice(0, 4)), now = nowIso();
  const OPEN = "EXISTS (SELECT 1 FROM invoices WHERE id = ? AND kind = 'invoice' AND status IN ('issued', 'paid'))";
  const res = await env.DB.batch([
    env.DB.prepare(`INSERT INTO invoice_seq (year, n) SELECT ?, 1 WHERE ${OPEN} ON CONFLICT (year) DO UPDATE SET n = n + 1`).bind(year, inv.id),
    env.DB.prepare(`${INSERT} SELECT ${NUMBER}, 'credit', subject, org_id, ?, ?, ?, ?, currency, 'issued', ?, NULL, id, '', period_from, period_to,
      seller, buyer, ?, ?, ? FROM invoices WHERE id = ? AND kind = 'invoice' AND status IN ('issued', 'paid') RETURNING *`)
      .bind(String(year), year, JSON.stringify(lines), -inv.net, -inv.vat, -inv.total, day, text(note, 1000), by || null, now, inv.id),
    env.DB.prepare("UPDATE invoices SET status = 'cancelled' WHERE id = ? AND kind = 'invoice' AND status IN ('issued', 'paid')").bind(inv.id),
    env.DB.prepare("UPDATE subscriptions SET status = 'canceled', ended_at = ?, updated_at = ? WHERE subject = ? AND source = 'invoice' AND invoice_id = ?")
      .bind(now, now, inv.subject, inv.id),
    // the plan started on trust at the order (its grant's note is the invoice's number)
    env.DB.prepare("UPDATE grants SET ended_at = ? WHERE subject = ? AND reason = 'trust' AND ended_at IS NULL AND note = ?").bind(now, inv.subject, inv.number),
  ]);
  changed();
  const credit = res[1].results?.[0];
  if (!credit) return { error: "state" };
  return { credit: parsed(credit), invoice: parsed(await invoiceById(env, inv.id)) };
}

/**
 * The transfer came: the invoice is paid. When it carries a plan, the subject's subscription (source « invoice ») runs over
 * the invoice's period and the subject's trust grants end. → { invoice } or { error: "not found" | "state" }.
 */
export async function markPaid(env, invoiceId, { how = "transfer", at = null, by = null } = {}) {
  const inv = await invoiceById(env, invoiceId);
  if (!inv || inv.kind !== "invoice") return { error: "not found" };
  if (inv.status !== "issued") return { error: "state" };
  const day = isDay(at) ? at : today(), now = nowIso();
  const stmts = [env.DB.prepare("UPDATE invoices SET status = 'paid', paid_at = ?, paid_how = ? WHERE id = ? AND status = 'issued'").bind(day, text(how, 40) || "transfer", inv.id)];
  if (inv.plan) {
    stmts.push(env.DB.prepare(`INSERT INTO subscriptions (subject, plan, status, period, current_start, current_end, cancel_at_end, stripe_sub, price_id, amount,
        currency, first_paid_at, renew_notice, ended_at, source, invoice_id, updated_at) VALUES (?, ?, 'active', 'year', ?, ?, 0, NULL, '', ?, ?, ?, NULL, NULL, 'invoice', ?, ?)
      ON CONFLICT (subject) DO UPDATE SET plan = excluded.plan, status = 'active', period = 'year', current_start = excluded.current_start,
        current_end = excluded.current_end, cancel_at_end = 0, stripe_sub = NULL, price_id = '', amount = excluded.amount, currency = excluded.currency,
        first_paid_at = COALESCE(subscriptions.first_paid_at, excluded.first_paid_at), renew_notice = NULL, ended_at = NULL, source = 'invoice',
        invoice_id = excluded.invoice_id, updated_at = excluded.updated_at`)
      .bind(inv.subject, inv.plan, inv.period_from, inv.period_to, inv.total, inv.currency, day, inv.id, now));
    stmts.push(env.DB.prepare("UPDATE grants SET ended_at = ? WHERE subject = ? AND reason = 'trust' AND ended_at IS NULL").bind(now, inv.subject));
  }
  await env.DB.batch(stmts);
  changed();
  return { invoice: parsed(await invoiceById(env, inv.id)) };
}

/** Marked paid by mistake: back to « issued »; the subscription it opened stops (status « unpaid »). The trust grant does not come back. */
export async function markUnpaid(env, invoiceId) {
  const inv = await invoiceById(env, invoiceId);
  if (!inv || inv.kind !== "invoice") return { error: "not found" };
  if (inv.status !== "paid") return { error: "state" };
  const now = nowIso();
  await env.DB.batch([
    env.DB.prepare("UPDATE invoices SET status = 'issued', paid_at = NULL, paid_how = '' WHERE id = ? AND status = 'paid'").bind(inv.id),
    env.DB.prepare("UPDATE subscriptions SET status = 'unpaid', ended_at = ?, updated_at = ? WHERE subject = ? AND source = 'invoice' AND invoice_id = ?")
      .bind(now, now, inv.subject, inv.id),
  ]);
  changed();
  return { invoice: parsed(await invoiceById(env, inv.id)) };
}

// ---- what the club routes and the administrators share --------------------------------------------------------------

/** An org's members in force today. */
export async function membersInForce(env, orgId) {
  const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM org_members WHERE org_id = ? AND state = 'ok' AND (until IS NULL OR until >= ?)").bind(Number(orgId), today()).first();
  return r?.n || 0;
}
/** The managers and treasurers in force: [{ id, email, first_name, lang }]. */
export async function officersOf(env, orgId) {
  const { results } = await env.DB.prepare(`SELECT u.id, u.email, u.first_name, u.display_name, u.lang, m.roles, m.until FROM org_members m JOIN users u ON u.id = m.user_id
    WHERE m.org_id = ? AND m.state = 'ok' AND u.status = 'active' AND u.email_verified = 1`).bind(Number(orgId)).all();
  const day = today();
  return (results || []).filter((m) => (!m.until || m.until >= day) && /(^|,)\s*(manager|treasurer)\s*(,|$)/.test(m.roles || ""));
}

/** The Club plan's price for an org: prices.club.small up to smallMax members in force, else year. */
export async function clubPrice(env, orgId) {
  const prices = await config(env, "prices"), c = prices?.club || {}, members = await membersInForce(env, orgId);
  const small = Number.isInteger(c.small) && Number.isFinite(Number(c.smallMax)) && members <= Number(c.smallMax);
  const seller = await config(env, "seller");
  return { amount: small ? c.small : c.year, small, year: c.year, smallAmount: c.small ?? null, smallMax: c.smallMax ?? null, members,
    currency: String(prices?.currency || "eur").toLowerCase(), vatRate: vatRateOf(seller), vatNote: String(seller?.vatNote || "") };
}
/** The one line of a Club order or quote. */
export const clubLine = (price, from, to) => ({ label: `Ozimut Club — ${from} → ${to}`, qty: 1, unit: price.amount, amount: price.amount, k: "club" });

/** An event's entries that count (entered, or entered and not started: not cancelled, nor a new account's still unconfirmed)
 *  and what the unit price makes of them: { entries, amount, perEntry, cap, currency }. */
export async function eventDue(env, eventId) {
  const prices = await config(env, "prices"), e = prices?.event || {};
  let n = 0;
  try { n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM entries WHERE event_id = ? AND state IN ('entered', 'dns')").bind(String(eventId)).first())?.n || 0; } catch (err) { n = 0; }
  const perEntry = Number(e.perEntry) || 0, cap = Number.isFinite(Number(e.cap)) && e.cap !== null ? Number(e.cap) : null;
  const amount = cap === null ? n * perEntry : Math.min(n * perEntry, cap);
  return { entries: n, amount, perEntry, cap, currency: String(prices?.currency || "eur").toLowerCase() };
}
/** The grant of an event bought by the unit (reason « event »), in force or not: the latest, or null. */
export const eventGrant = async (env, eventId) => (await env.DB.prepare(
  "SELECT id, plan, until, created_at, ended_at FROM grants WHERE subject = ? AND reason = 'event' ORDER BY id DESC LIMIT 1").bind(`e${eventId}`).first()) || null;
/** The invoice of an event bought by the unit (not cancelled), or null. */
export const eventInvoice = async (env, eventId) => (await env.DB.prepare(
  "SELECT * FROM invoices WHERE subject = ? AND kind = 'invoice' AND status != 'cancelled' ORDER BY id DESC LIMIT 1").bind(`e${eventId}`).first()) || null;

/**
 * « Facturer » an event bought by the unit: the invoice to the event's club, min(entries × perEntry, cap), one line.
 * → { invoice } or { error: "not found" | "not bought" | "org" | "exists" (+ invoice) | "nothing" | "seller" | "billing" }.
 */
export async function invoiceEvent(env, ev, orgId, by) {
  if (!ev) return { error: "not found" };
  if (!(await eventGrant(env, ev.id))) return { error: "not bought" };
  if (!orgId) return { error: "org" };
  const had = await eventInvoice(env, ev.id);
  if (had) return { error: "exists", invoice: brief(had) };
  const due = await eventDue(env, ev.id);
  if (due.amount <= 0) return { error: "nothing" };
  const capped = due.cap !== null && due.entries * due.perEntry > due.cap;
  const line = capped ? { label: `Ozimut — ${ev.name} (${ev.date}) — ${due.entries} × ${due.perEntry / 100}, max.`, qty: 1, unit: due.amount, amount: due.amount, k: `event:${ev.id}` }
    : { label: `Ozimut — ${ev.name} (${ev.date})`, qty: due.entries, unit: due.perEntry, amount: due.amount, k: `event:${ev.id}` };
  return issue(env, { subject: `e${ev.id}`, orgId, lines: [line], by });
}

/**
 * The reminders of the invoices past their due day (the daily check, and the administrators' « check »): each issued invoice
 * is reminded once, to its club's managers and treasurers. `send(to, mail)` sends one e-mail (_lib/billing.js sendBilling);
 * `mailOf(user, { club, invoice })` writes it (_lib/templates.js clubInvoiceReminderMail). -> the number of invoices reminded.
 */
export async function remindInvoices(env, send, mailOf) {
  const { results } = await env.DB.prepare(`SELECT i.*, o.name AS org_name FROM invoices i LEFT JOIN orgs o ON o.id = i.org_id
    WHERE i.kind = 'invoice' AND i.status = 'issued' AND i.reminded = 0 AND i.due_at < ? AND i.org_id IS NOT NULL ORDER BY i.id LIMIT 20`).bind(today()).all();
  let n = 0;
  for (const row of results || []) {
    const took = await env.DB.prepare("UPDATE invoices SET reminded = 1 WHERE id = ? AND reminded = 0 AND status = 'issued'").bind(row.id).run();
    if (!(took.meta?.changes > 0)) continue;
    const inv = parsed(row);
    for (const u of await officersOf(env, row.org_id)) await send(u.email, mailOf(u, { club: row.org_name || inv.buyer.name || "", invoice: inv }));
    n += 1;
  }
  return n;
}
