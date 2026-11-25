// Ozimut's own invoices (docs/billing/design.md §6, §11; functions/_lib/invoices.js) on an in-memory database standing for D1
// (node:sqlite, Node 22.5+): the numbering without gaps — under concurrent issues, and when an insert fails —, the totals with
// and without VAT, an issued invoice left as it was, a credit note cancelling the invoice and closing what it opened, « paid »
// opening a year, quotes taking no number. Run: node tools/billing/t_invoice.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const lib = (f) => import(pathToFileURL(join(ROOT, "functions", "_lib", f)).href);
const I = await lib("invoices.js");
const P = await lib("plans.js");

// ---- D1's interface over node:sqlite: prepare().bind().first() / all() / run(), batch() as one transaction -------------------
function d1() {
  const db = new DatabaseSync(":memory:");
  const api = { failNextBatchAt: -1, raw: db };
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a.map((x) => (x === undefined ? null : typeof x === "boolean" ? Number(x) : x))),
    exec() {
      const s = db.prepare(sql);
      if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) return { results: s.all(...args), meta: { changes: 0 } };
      const r = s.run(...args);
      return { results: [], meta: { changes: Number(r.changes) } };
    },
    async first() { return this.exec().results[0] ?? null; },
    async all() { return this.exec(); },
    async run() { return this.exec(); },
  });
  api.prepare = (sql) => stmt(sql);
  api.batch = async (list) => {
    db.exec("BEGIN");
    try {
      const out = [];
      list.forEach((s, i) => {
        if (i === api.failNextBatchAt) { api.failNextBatchAt = -1; throw new Error("injected failure"); }
        out.push(s.exec());
      });
      db.exec("COMMIT");
      return out;
    } catch (e) { db.exec("ROLLBACK"); throw e; }
  };
  db.exec(readFileSync(join(ROOT, "migrations", "0034_billing.sql"), "utf8"));
  db.exec(`CREATE TABLE orgs (id INTEGER PRIMARY KEY, cc TEXT, kind TEXT, code TEXT, name TEXT, parent INTEGER);
    CREATE TABLE org_members (org_id INTEGER, user_id INTEGER, roles TEXT, state TEXT, until TEXT);
    INSERT INTO orgs (id, cc, kind, code, name) VALUES (6, 'FR', 'club', '7799', 'Balise Exemple'), (7, 'FR', 'club', '7798', 'Club Sans Adresse');`);
  return api;
}

let failed = 0, n = 0;
const ok = (cond, what) => { n += 1; if (!cond) { failed += 1; console.log(`FAIL ${what}`); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), `${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const year = Number(P.today().slice(0, 4));
const num = (k) => `OZ-${year}-${String(k).padStart(4, "0")}`;
const SELLER = { name: "Ozimut (exemple)", form: "SASU", address: "1 rue de l'Exemple, 75000 Paris", country: "FR", siren: "000000000", vat: 0,
  vatNote: "TVA non applicable, art. 293 B du CGI", iban: "FR7600000000000000000000000", bic: "EXAMPLEX" };
const line = (amount, label = "Ozimut Club") => ({ label, qty: 1, unit: amount });

async function fresh({ seller = SELLER } = {}) {
  const env = { DB: d1(), BILLING: "test" };
  P.changed();
  if (seller) await P.setConfig(env, "seller", seller, 1);
  await I.saveOrgBilling(env, 6, { name: "Balise Exemple", address: "2 rue du Test, 77000 Melun", country: "FR", siret: "", vat_id: "", email: "" }, 1);
  return env;
}

// ---- totals -------------------------------------------------------------------------------------------------------------------
eq(I.totals([{ amount: 12000 }], 0), { net: 12000, vat: 0, total: 12000 }, "totals without VAT");
eq(I.totals([{ amount: 12000 }, { amount: 2500 }], 20), { net: 14500, vat: 2900, total: 17400 }, "totals at 20 %");
eq(I.totals([{ amount: 1 }, { amount: 1 }, { amount: 1 }], 50).vat, 2, "1.5 rounds away from zero (up)");
eq(I.totals([{ amount: -3 }], 50).vat, -2, "−1.5 rounds away from zero (down)");
eq(I.totals([{ amount: 9999 }], 5.5), { net: 9999, vat: 550, total: 10549 }, "totals at 5.5 %");
eq(I.roundHalf(2.5), 3, "roundHalf 2.5"); eq(I.roundHalf(-2.5), -3, "roundHalf −2.5"); eq(I.roundHalf(2.4), 2, "roundHalf 2.4");
eq(I.vatRateOf({ vat: 20 }), 20, "a rate in percent"); eq(I.vatRateOf({ vat: 0.2 }), 20, "a rate as a fraction"); eq(I.vatRateOf({}), 0, "no rate");
eq(I.cleanLines([{ label: "x", qty: 3, unit: 20 }])[0].amount, 60, "a line's amount = qty × unit");
ok(I.cleanLines([{ label: "", unit: 1 }]) === null && I.cleanLines([]) === null && I.cleanLines([{ label: "x", unit: 1.5 }]) === null, "bad lines refused");
eq(I.yearEnd("2026-11-25"), "2027-11-24", "a year less a day"); eq(I.yearEnd("2028-02-29"), "2029-02-28", "from a 29 February");

// ---- the seller's and the buyer's identity -------------------------------------------------------------------------------------
{
  const env = await fresh({ seller: null });
  eq(await I.issue(env, { subject: "o6", orgId: 6, lines: [line(12000)] }), { error: "seller" }, "no seller: refused");
  await P.setConfig(env, "seller", { name: "Ozimut", address: "1 rue X" }, 1);
  eq(await I.issue(env, { subject: "o6", orgId: 6, lines: [line(12000)] }), { error: "seller" }, "a seller without SIREN or SIRET: refused");
  await P.setConfig(env, "seller", SELLER, 1);
  eq(await I.issue(env, { subject: "o7", orgId: 7, lines: [line(12000)] }), { error: "billing" }, "a buyer without name and address: refused");
  eq((await env.DB.prepare("SELECT COUNT(*) AS n FROM invoice_seq").first()).n, 0, "a refusal takes no number");
  const r = await I.issue(env, { subject: "o6", orgId: 6, lines: [line(12000)] });
  eq(r.invoice?.number, num(1), "the first invoice is 0001");
}

// ---- numbering: concurrent issues, a failed insert, credit notes in the same series ---------------------------------------------
{
  const env = await fresh();
  const all = await Promise.all(Array.from({ length: 25 }, (_, i) => I.issue(env, { subject: "o6", orgId: 6, lines: [line(1000 + i)] })));
  const numbers = all.map((r) => r.invoice.number).sort();
  eq(numbers, Array.from({ length: 25 }, (_, i) => num(i + 1)), "25 concurrent issues: 0001…0025, each once");
  // the insert fails after the sequence moved: the transaction is undone, the number is not lost
  env.DB.failNextBatchAt = 1;
  let threw = false;
  try { await I.issue(env, { subject: "o6", orgId: 6, lines: [line(5)] }); } catch (e) { threw = true; }
  ok(threw, "the injected failure surfaced");
  eq((await I.issue(env, { subject: "o6", orgId: 6, lines: [line(6)] })).invoice.number, num(26), "after a failed issue the next number is 0026 (no gap)");
  // quotes take no number
  const q = await I.quote(env, { subject: "o6", orgId: 6, lines: [line(12000)], plan: "club" });
  ok(q.invoice.number === null && q.invoice.kind === "quote" && q.invoice.status === "draft", "a quote: no number, draft");
  eq(q.invoice.due_at, I.addDays(P.today(), 60), "a quote is valid 60 days");
  eq((await I.issue(env, { subject: "o6", orgId: 6, lines: [line(7)], kind: "quote" })).invoice.number, null, "issue(kind quote) is a quote");
  eq((await I.issue(env, { subject: "o6", orgId: 6, lines: [line(8)] })).invoice.number, num(27), "quotes left the series alone");
  // a credit note takes the next number; twice at once: one credit note, one number
  const target = all[3].invoice.id;
  const two = await Promise.all([I.creditNote(env, target, 1, "a"), I.creditNote(env, target, 1, "b")]);
  eq(two.filter((r) => r.credit).length, 1, "two credit notes at once: one made");
  eq(two.filter((r) => r.error === "state").length, 1, "… the other refused");
  eq(two.find((r) => r.credit).credit.number, num(28), "the credit note is 0028");
  eq((await I.issue(env, { subject: "o6", orgId: 6, lines: [line(9)] })).invoice.number, num(29), "and the refused one took no number");
  const rows = (await env.DB.prepare("SELECT number FROM invoices WHERE number IS NOT NULL ORDER BY number").all()).results.map((r) => r.number);
  eq(rows, Array.from({ length: 29 }, (_, i) => num(i + 1)), "the whole series 0001…0029 without a gap or a repeat");
  eq(await I.nextNumber(env, year), num(30), "nextNumber gives the next of the year");
  eq(await I.nextNumber(env, year + 1), `OZ-${year + 1}-0001`, "a new year starts at 0001");
}

// ---- an issued invoice is what it was; VAT; due day -------------------------------------------------------------------------------
{
  const env = await fresh({ seller: { ...SELLER, vat: 20, vatNote: "" } });
  const from = P.today(), to = I.yearEnd(from);
  const r = await I.issue(env, { subject: "o6", orgId: 6, lines: [line(12000)], plan: "club", periodFrom: from, periodTo: to, by: 3 });
  const inv = r.invoice;
  eq([inv.net, inv.vat, inv.total, inv.vat_rate], [12000, 2400, 14400, 20], "an invoice at 20 %");
  eq([inv.status, inv.kind, inv.issued_at, inv.due_at, inv.ref], ["issued", "invoice", from, I.addDays(from, 30), inv.number], "issued today, due in 30 days, its reference its number");
  eq([inv.seller.name, inv.buyer.name, inv.buyer.org], [SELLER.name, "Balise Exemple", "Balise Exemple"], "seller and buyer frozen in the row");
  eq(await I.issue(env, { subject: "o6", orgId: 6, lines: [line(1)], plan: "club" }), { error: "period" }, "a plan needs its period");
  // the seller and the buyer change afterwards: the invoice does not
  await P.setConfig(env, "seller", { ...SELLER, name: "Autre nom", vat: 0 }, 1);
  await I.saveOrgBilling(env, 6, { name: "Nouveau nom", address: "ailleurs", country: "FR", siret: "", vat_id: "", email: "" }, 1);
  const frozen = (x) => JSON.stringify([x.lines, x.net, x.vat, x.total, x.seller, x.buyer, x.number, x.issued_at]);
  const before = frozen(inv);
  // paid: the subscription runs the invoice's period, the trust grant ends
  await P.addGrant(env, { subject: "o6", plan: "club", until: I.addDays(from, 30), reason: "trust", note: inv.number, by: 3 });
  eq((await P.orgPlan(env, 6)).plan, "club", "on trust: the club has the plan");
  const paid = await I.markPaid(env, inv.id, { how: "transfer", at: from, by: 1 });
  eq([paid.invoice.status, paid.invoice.paid_at, paid.invoice.paid_how], ["paid", from, "transfer"], "marked paid");
  eq(frozen(paid.invoice), before, "paid: lines, totals, seller and buyer untouched");
  const sub = await env.DB.prepare("SELECT * FROM subscriptions WHERE subject = 'o6'").first();
  eq([sub.plan, sub.status, sub.source, sub.current_start, sub.current_end, sub.amount, sub.invoice_id], ["club", "active", "invoice", from, to, 14400, inv.id], "the subscription: one year from the order");
  eq((await env.DB.prepare("SELECT COUNT(*) AS n FROM grants WHERE subject = 'o6' AND reason = 'trust' AND ended_at IS NULL").first()).n, 0, "the trust grant ended");
  const plan = await P.orgPlan(env, 6);
  eq([plan.plan, plan.until, plan.why?.kind], ["club", to, "sub"], "orgPlan: club by its subscription until the period's end");
  eq((await I.markPaid(env, inv.id, {})).error, "state", "paid twice: refused");
  // unpaid again, then paid again
  const un = await I.markUnpaid(env, inv.id);
  eq([un.invoice.status, un.invoice.paid_at], ["issued", null], "marked unpaid");
  eq((await P.orgPlan(env, 6)).plan, null, "unpaid: the plan stops");
  await I.markPaid(env, inv.id, { at: from });
  eq((await P.orgPlan(env, 6)).plan, "club", "paid again: the plan is back");
  // the credit note: opposite lines, the invoice cancelled, the subscription ended
  const c = await I.creditNote(env, inv.id, 1, "erreur de club");
  eq([c.credit.kind, c.credit.of_invoice, c.credit.net, c.credit.vat, c.credit.total, c.credit.lines[0].amount], ["credit", inv.id, -12000, -2400, -14400, -12000], "the credit note mirrors the invoice");
  ok(c.credit.number && c.credit.number !== inv.number, "the credit note has its own number");
  eq([c.credit.seller.name, c.credit.buyer.name], [SELLER.name, "Balise Exemple"], "the credit note carries the invoice's seller and buyer");
  eq(c.invoice.status, "cancelled", "the invoice is cancelled");
  eq(frozen(c.invoice), before, "cancelled: lines, totals, seller and buyer untouched");
  const ended = await env.DB.prepare("SELECT status, ended_at FROM subscriptions WHERE subject = 'o6'").first();
  ok(ended.status === "canceled" && !!ended.ended_at, "the subscription the payment opened is ended");
  eq((await P.orgPlan(env, 6)).plan, null, "no plan left");
  eq((await I.creditNote(env, inv.id, 1)).error, "state", "a second credit note: refused");
  eq((await I.creditNote(env, c.credit.id, 1)).error, "not found", "no credit note of a credit note");
  eq((await I.markPaid(env, inv.id, {})).error, "state", "a cancelled invoice cannot be paid");
}

// ---- a credit note on an unpaid order ends the trust -------------------------------------------------------------------------------
{
  const env = await fresh();
  const from = P.today();
  const { invoice } = await I.issue(env, { subject: "o6", orgId: 6, lines: [line(9000)], plan: "club", periodFrom: from, periodTo: I.yearEnd(from) });
  await P.addGrant(env, { subject: "o6", plan: "club", until: I.addDays(from, 30), reason: "trust", note: invoice.number });
  eq((await P.orgPlan(env, 6)).plan, "club", "ordered: active on trust");
  await I.creditNote(env, invoice.id, 1);
  eq((await P.orgPlan(env, 6)).plan, null, "the order cancelled: the trust ends");
  // an invoice without a plan opens nothing when paid
  const free = await I.issue(env, { subject: "eabc", orgId: 6, lines: [{ label: "Event", qty: 120, unit: 20 }] });
  eq(free.invoice.total, 2400, "120 entries × 0.20");
  await I.markPaid(env, free.invoice.id, {});
  eq((await env.DB.prepare("SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'active'").first()).n, 0, "no plan on the invoice: no subscription");
}

console.log(failed ? `${failed} of ${n} checks FAILED` : `ok — ${n} checks`);
process.exit(failed ? 1 : 0);
