// /api/accounts — a club's accounts (docs/clubs/design.md §4 « Club accounts »; owner, 2026-11-22; migrations 0030-0031). Every
// payment is made outside Ozimut: this says who owes what to whom, keeps what the treasurer marked, and gives the statements.
// A club's treasurer (right `treasure`: managers and treasurers; administrators) sees
//   - « À recevoir » (as organiser): its events' entries carried by visiting clubs, club by club, under the reference each club
//     owes (entry_refs payer o<org>), and its events' amounts still due;
//   - « À payer » (as the runners' club): what it owes each organiser for the entries it carries (entries.payer_org = it), with
//     the organiser's bank details and the reference;
//   - « Membres »: per member and season what the club carried, what the member paid back (club_ledger repaid), the bills sent
//     (club_ledger bill: the year-end bill, its reference « OZ-<club>-<member> »), the balance;
//   - « Compensation »: the clubs that accepted netting both ways (org_netting), what each owes the other and the net.
// A member sees their own balance with the club. The bank's statement file is read in the browser (site/assets/js/bankstatement.js);
// only the lines matched are sent here.
//
//   GET    /api/accounts/<org>?season=YYYY        the treasurer: { org, season, seasons, policy, bank, receive, events, pay,
//                                                 members, netting }
//   GET    /api/accounts/<org>/me?season=         a member: { lines, repaid, carried, balance, ref, recover, bank, bills }
//   GET    /api/accounts/<org>/statement?from=<organiser>&to=<payer club>&season=   the treasurer of either club: the entries one
//                                                 club carries at the other's events, the references, the organiser's bank
//   POST   /api/accounts/<org>/mark              { payer: <club id>, season, state: paid|due, how?, events? } the organiser's
//                                                 treasurer marks a club's statement
//   POST   /api/accounts/<org>/pay               { items: [{ ref }], bills: [{ ref, amount, date? }], how? } the bank statement's
//                                                 lines matched: entries' references of the club's events, members' bills
//   GET    /api/accounts/<org>/refs              the references still open: its events' entries due, its members' bills
//   GET    /api/accounts/<org>/member?person=&season=   one member: the entries carried, the ledger's rows, the reference
//   POST   /api/accounts/<org>/ledger            { person, kind: repaid|adjust, amount (cents), season, note? } a row added
//   DELETE /api/accounts/<org>/ledger/<id>       a row removed (a bill's row stays)
//   POST   /api/accounts/<org>/bill              { person, season, send?, pdf?: base64 } the year-end bill recorded (and e-mailed
//                                                 in the club's name, replies to its contact): -> { ref, sent: sent|queued|none }
//   POST   /api/accounts/<org>/remind            { events?: [ids], clubs?: bool } a reminder to those who have not paid (mail and
//                                                 push in the club's name; each payer once in three days)
//   POST   /api/accounts/<org>/settle            { other, season } netting settled: both sides' entries marked paid (« netting »)
//   GET    /api/accounts/<org>/events?season=    the events the club's members enter (or may), whether its policy carries them
//   POST   /api/accounts/<org>/apply             { event } the policy applied to its members' entries still due at that event
//   GET    /api/accounts/<org>/journal?season=   every row of the season: entries received and carried, the ledger
// Every route answers 503 { error: "not ready" } before migrations 0030-0031.

import { allow, currentUser, isAdmin, json, nowIso, parisToday, readBody, userLang } from "../../_lib/api.js";
import { can, orgById, settingsOf, nettingAccepted, ready, notReady, roleSet } from "../../_lib/orgs.js";
import { policyOf, carriesEvent, payerFor } from "../../_lib/clubpolicy.js";
import { orgBank, refFor, touch, loadForm } from "../../_lib/entries.js";
import { sendNow, sendOrQueue, queueStatement, flushQueue } from "../../_lib/mail.js";
import { queuePush, flushPush, pushReady } from "../../_lib/push.js";
import { billMail, payReminderMail, payReminderPush } from "../../_lib/templates.js";
import { childrenOf } from "../../_lib/track.js";

const no = (code, status = 400, more = {}) => json({ error: code, ...more }, status);
const SEASON = /^\d{4}$/;
const clean = (s, n) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const orgView = (o) => (o ? { id: o.id, name: o.name, code: o.code || "", cc: o.cc } : null);
const add = (o, cur, c) => { const k = cur || "EUR"; o[k] = (o[k] || 0) + (Number(c) || 0); return o; };
const CUR = "COALESCE(json_extract(f.prices, '$.currency'), 'EUR')";
const BANK = (s) => (s?.iban ? { iban: s.iban, holder: s.holder || "", bic: s.bic || "" } : null);
const emailOf = (s) => (/[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}/i.exec(String(s || "")) || [""])[0];

export const onRequest = async (ctx) => {
  const { request, env } = ctx;
  if (!env.DB) return no("server not configured", 500);
  const user = await currentUser(request, env);
  if (!user) return no("login required", 401);
  try {
    if (!(await ready(env))) return no("not ready", 503);
    return await route(ctx, user);
  } catch (e) {
    if (notReady(e)) return no("not ready", 503);
    throw e;
  }
};

async function route(ctx, user) {
  const { request, env, params } = ctx;
  const parts = [].concat(params.path || []).map(String).filter(Boolean);
  const method = request.method, url = new URL(request.url);
  const id = Number(parts[0]);
  if (!Number.isInteger(id) || id <= 0) return no("not found", 404);
  const org = await orgById(env, id);
  if (!org) return no("not found", 404);
  const sub = parts[1] || "";
  const season = SEASON.test(url.searchParams.get("season") || "") ? url.searchParams.get("season") : parisToday().slice(0, 4);
  if (method !== "GET" && user.demo_until) return no("demo", 403);
  if (method !== "GET" && !(await allow(env, `acc:${user.id}`, 400, 3600))) return no("too many", 429);

  if (sub === "me" && method === "GET") {
    if (!(await can(env, user, id, "member"))) return no("forbidden", 403);
    return json(await myAccount(env, user, org, season));
  }
  if (sub === "statement" && method === "GET") {
    const from = Number(url.searchParams.get("from")), to = Number(url.searchParams.get("to"));
    if (from !== id && to !== id) return no("bad request");
    if (!(await can(env, user, id, "treasure"))) return no("forbidden", 403);
    return json(await statement(env, from, to, season));
  }
  if (!(await can(env, user, id, "treasure"))) return no("forbidden", 403);
  if (!sub && method === "GET") return json(await overview(env, request, org, season));
  if (sub === "refs" && method === "GET") return json(await openRefs(env, org));
  if (sub === "member" && method === "GET") {
    const person = clean(url.searchParams.get("person"), 200);
    if (!person) return no("bad request");
    return json(await memberAccount(env, org, person, season));
  }
  if (sub === "events" && method === "GET") return json(await eventsOf(env, org, season));
  if (sub === "journal" && method === "GET") return json(await journal(env, org, season));
  const b = (await readBody(request)) || {};
  if (sub === "mark" && method === "POST") return mark(env, user, org, b);
  if (sub === "pay" && method === "POST") return bankPay(env, user, org, b);
  if (sub === "ledger" && !parts[2] && method === "POST") return ledgerAdd(env, user, org, b);
  if (sub === "ledger" && /^\d+$/.test(parts[2] || "") && method === "DELETE") {
    await env.DB.prepare("DELETE FROM club_ledger WHERE id = ? AND org_id = ? AND kind != 'bill'").bind(Number(parts[2]), org.id).run();
    return json({ ok: true });
  }
  if (sub === "bill" && method === "POST") return bill(env, user, org, b);
  if (sub === "remind" && method === "POST") return remind(env, user, org, b, season);
  if (sub === "settle" && method === "POST") return settle(env, user, org, b);
  if (sub === "apply" && method === "POST") return apply(env, request, org, b);
  return no("not found", 404);
}

// ---- the overview ---------------------------------------------------------------------------------------------------------
async function orgsByIds(env, ids) {
  const list = [...new Set(ids.filter(Boolean).map(Number))];
  if (!list.length) return new Map();
  const { results } = await env.DB.prepare(`SELECT id, name, code, cc, kind, state FROM orgs WHERE id IN (${list.map(() => "?").join(",")})`).bind(...list).all();
  return new Map(results.map((o) => [o.id, o]));
}
/** The clubs that accepted netting with this one and that it accepted (both ways). */
async function nettingPartners(env, orgId) {
  const { results } = await env.DB.prepare(`SELECT a.other_id AS id FROM org_netting a JOIN org_netting b ON b.org_id = a.other_id AND b.other_id = a.org_id
    WHERE a.org_id = ?`).bind(orgId).all();
  return new Set(results.map((r) => r.id));
}
async function seasonsOf(env, orgId) {
  const { results } = await env.DB.prepare(`SELECT DISTINCT substr(e.date, 1, 4) AS y FROM entries x JOIN events e ON e.id = x.event_id
    WHERE (e.org_id = ? OR x.payer_org = ?) AND x.state != 'cancelled'
    UNION SELECT DISTINCT season AS y FROM club_ledger WHERE org_id = ? ORDER BY y DESC`).bind(orgId, orgId, orgId).all();
  return results.map((r) => r.y).filter((y) => SEASON.test(String(y || "")));
}

async function overview(env, request, org, season) {
  const s = await settingsOf(env, org.id), policy = policyOf(s);
  const partners = await nettingPartners(env, org.id);
  // « À recevoir »: the entries visiting clubs carry at this club's events
  const { results: rec } = await env.DB.prepare(`SELECT x.payer_org, x.event_id, x.order_ref, x.pay_state, x.price, x.paid_how, e.name AS ev_name, e.date AS ev_date, ${CUR} AS cur
    FROM entries x JOIN events e ON e.id = x.event_id LEFT JOIN entry_forms f ON f.event_id = x.event_id
    WHERE e.org_id = ? AND x.payer = 'club' AND x.payer_org IS NOT NULL AND x.payer_org != ? AND x.state != 'cancelled' AND substr(e.date, 1, 4) = ?
    ORDER BY e.date, x.event_id`).bind(org.id, org.id, season).all();
  // « À payer »: what this club carries at the others' events
  const { results: pay } = await env.DB.prepare(`SELECT x.event_id, x.order_ref, x.pay_state, x.price, x.paid_how, e.name AS ev_name, e.date AS ev_date, e.org_id AS ev_org,
      e.club AS ev_club, ${CUR} AS cur FROM entries x JOIN events e ON e.id = x.event_id LEFT JOIN entry_forms f ON f.event_id = x.event_id
    WHERE x.payer = 'club' AND x.payer_org = ? AND x.state != 'cancelled' AND substr(e.date, 1, 4) = ? AND COALESCE(e.org_id, 0) != ?
    ORDER BY e.date, x.event_id`).bind(org.id, season, org.id).all();
  const names = await orgsByIds(env, [...rec.map((r) => r.payer_org), ...pay.map((r) => r.ev_org)]);
  const group = (rows, keyOf) => {
    const by = new Map();
    for (const r of rows) {
      const k = keyOf(r);
      if (!by.has(k)) by.set(k, { events: new Map(), due: {}, paid: {}, total: {} });
      const g = by.get(k);
      if (!g.events.has(r.event_id)) g.events.set(r.event_id, { id: r.event_id, name: r.ev_name, date: r.ev_date, ref: r.order_ref, cur: r.cur, n: 0, due: 0, paid: 0, total: 0, how: "" });
      const e = g.events.get(r.event_id);
      e.n++; e.total += r.price; add(g.total, r.cur, r.price);
      if (r.pay_state === "due") { e.due += r.price; add(g.due, r.cur, r.price); }
      else if (r.pay_state === "paid") { e.paid += r.price; add(g.paid, r.cur, r.price); e.how = r.paid_how || e.how; }
    }
    return by;
  };
  const receive = [...group(rec, (r) => r.payer_org)].map(([oid, g]) => ({ org: orgView(names.get(oid)) || { id: oid, name: "?" }, events: [...g.events.values()],
    due: g.due, paid: g.paid, total: g.total, netting: partners.has(oid) }));
  const payBy = group(pay, (r) => (r.ev_org ? `o${r.ev_org}` : `c${r.ev_club || ""}`));
  const payOut = [];
  for (const [k, g] of payBy) {
    const first = [...g.events.values()][0];
    const oid = k.startsWith("o") ? Number(k.slice(1)) : null;
    const evRow = await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(first.id).first();
    const bank = evRow ? await orgBank(env, evRow, await loadForm(env, first.id)) : null;
    payOut.push({ org: oid ? orgView(names.get(oid)) : null, club: evRow?.club || "", events: [...g.events.values()], due: g.due, paid: g.paid, total: g.total,
      bank: bank ? { iban: bank.iban, holder: bank.holder, bic: bank.bic } : null, netting: oid ? partners.has(oid) : false });
  }
  // this club's events: every entry's amount due (runners and clubs)
  const { results: evs } = await env.DB.prepare(`SELECT e.id, e.name, e.date, ${CUR} AS cur,
      SUM(CASE WHEN x.state != 'cancelled' THEN 1 ELSE 0 END) AS n,
      SUM(CASE WHEN x.state != 'cancelled' AND x.pay_state = 'due' THEN x.price ELSE 0 END) AS due,
      SUM(CASE WHEN x.state != 'cancelled' AND x.pay_state = 'paid' THEN x.price ELSE 0 END) AS paid,
      SUM(CASE WHEN x.state != 'cancelled' AND x.pay_state = 'due' AND x.payer = 'runner' THEN 1 ELSE 0 END) AS unpaid
    FROM events e JOIN entry_forms f ON f.event_id = e.id LEFT JOIN entries x ON x.event_id = e.id
    WHERE e.org_id = ? AND e.status = 'active' AND substr(e.date, 1, 4) = ? GROUP BY e.id ORDER BY e.date`).bind(org.id, season).all();
  const members = await membersOf(env, org, season, policy);
  const netting = [];
  for (const oid of partners) {
    const o = (await orgsByIds(env, [oid])).get(oid);
    const theyOwe = receive.find((x) => x.org.id === oid)?.due || {}, weOwe = payOut.find((x) => x.org?.id === oid)?.due || {};
    const net = {};
    for (const [c, v] of Object.entries(theyOwe)) add(net, c, v);
    for (const [c, v] of Object.entries(weOwe)) add(net, c, -v);
    netting.push({ org: orgView(o), theyOwe, weOwe, net });
  }
  return { org: orgView(org), season, seasons: [...new Set([season, ...(await seasonsOf(env, org.id))])].sort().reverse(), policy,
    bank: BANK(s), contact: s.contact || "", receive, pay: payOut, events: evs, members, netting };
}

// ---- members ---------------------------------------------------------------------------------------------------------------
const FOLD = (s) => String(s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");
const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** A member's reference for the club's bills: « OZ-<club>-<member> » — the club's number (else its id) and the licence (else the
 *  initials and two characters of the person's key). */
export function memberRef(org, person, first = "", last = "") {
  const club = String(org.code || org.id).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const lic = /^L(\d+)$/.exec(person)?.[1];
  if (lic) return `OZ-${club}-${lic}`;
  let h = 2166136261;
  for (const c of String(person)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const ini = (FOLD(first).slice(0, 1) + FOLD(last).slice(0, 2)) || "X";
  return `OZ-${club}-${ini}${ALPHA[h % 31]}${ALPHA[(h >>> 5) % 31]}`;
}

/** The ledger of each member for the season: entries carried (payer club = this one), repaid, adjustments, bills. */
async function membersOf(env, org, season, policy) {
  const { results: rows } = await env.DB.prepare(`SELECT x.person, x.first_name, x.last_name, x.licence, x.user_id, x.price, ${CUR} AS cur
    FROM entries x JOIN events e ON e.id = x.event_id LEFT JOIN entry_forms f ON f.event_id = x.event_id
    WHERE x.payer = 'club' AND x.payer_org = ? AND x.state != 'cancelled' AND substr(e.date, 1, 4) = ? ORDER BY e.date`).bind(org.id, season).all();
  const { results: led } = await env.DB.prepare("SELECT * FROM club_ledger WHERE org_id = ? AND season = ? ORDER BY id").bind(org.id, season).all();
  const by = new Map();
  const get = (p) => {
    if (!by.has(p)) by.set(p, { person: p, name: "", first: "", last: "", licence: "", user_id: null, n: 0, carried: 0, cur: "EUR", repaid: 0, adjust: 0, bills: 0, lastBill: null });
    return by.get(p);
  };
  for (const r of rows) {
    const m = get(r.person);
    m.name = `${r.first_name} ${r.last_name}`.trim(); m.first = r.first_name; m.last = r.last_name; m.licence = r.licence || m.licence;
    m.user_id = r.user_id || m.user_id; m.n++; m.carried += r.price; m.cur = r.cur;
  }
  for (const l of led) {
    const m = get(l.person);
    if (l.kind === "repaid") m.repaid += l.amount;
    else if (l.kind === "adjust") m.adjust += l.amount;
    else if (l.kind === "bill") { m.bills++; m.lastBill = { at: l.at, amount: l.amount, ref: l.ref }; }
    m.user_id = m.user_id || l.user_id;
  }
  // a member known only by the ledger: their name from their last entry
  for (const m of by.values()) {
    if (!m.name) {
      const r = await env.DB.prepare("SELECT first_name, last_name, licence FROM entries WHERE person = ? ORDER BY id DESC LIMIT 1").bind(m.person).first();
      if (r) { m.name = `${r.first_name} ${r.last_name}`.trim(); m.first = r.first_name; m.last = r.last_name; m.licence = r.licence; }
    }
    m.balance = policy.recover ? m.carried - m.repaid - m.adjust : 0;
    m.ref = memberRef(org, m.person, m.first, m.last);
  }
  return [...by.values()].sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
}

/** One member's account: the entries carried and the ledger's rows. */
async function memberAccount(env, org, person, season) {
  const policy = policyOf(await settingsOf(env, org.id));
  const { results: lines } = await env.DB.prepare(`SELECT x.id, x.first_name, x.last_name, x.licence, x.user_id, x.by_user, x.price, x.pay_state, x.state, x.class_id,
      e.id AS ev_id, e.name AS event, e.date, e.club AS ev_club, ${CUR} AS cur FROM entries x JOIN events e ON e.id = x.event_id LEFT JOIN entry_forms f ON f.event_id = x.event_id
    WHERE x.payer = 'club' AND x.payer_org = ? AND x.person = ? AND x.state != 'cancelled' AND substr(e.date, 1, 4) = ? ORDER BY e.date`).bind(org.id, person, season).all();
  const { results: ledger } = await env.DB.prepare("SELECT id, kind, amount, ref, note, at, season FROM club_ledger WHERE org_id = ? AND person = ? AND season = ? ORDER BY at")
    .bind(org.id, person, season).all();
  const carried = lines.reduce((s, r) => s + r.price, 0);
  const repaid = ledger.filter((l) => l.kind === "repaid").reduce((s, l) => s + l.amount, 0);
  const adjust = ledger.filter((l) => l.kind === "adjust").reduce((s, l) => s + l.amount, 0);
  let first = lines[0]?.first_name || "", last = lines[0]?.last_name || "";
  if (!first) {
    const r = await env.DB.prepare("SELECT first_name, last_name FROM entries WHERE person = ? ORDER BY id DESC LIMIT 1").bind(person).first();
    first = r?.first_name || ""; last = r?.last_name || "";
  }
  const to = await recipientOf(env, person, lines);
  const s = await settingsOf(env, org.id);
  return { org: orgView(org), person, name: `${first} ${last}`.trim(), season, cur: lines[0]?.cur || "EUR", recover: policy.recover,
    lines: lines.map((r) => ({ id: r.id, event: r.event, ev: r.ev_id, date: r.date, runner: `${r.first_name} ${r.last_name}`.trim(), amount: r.price, club: r.ev_club })),
    ledger, carried, repaid, adjust, balance: policy.recover ? carried - repaid - adjust : 0, ref: memberRef(org, person, first, last),
    reachable: !!to, bank: BANK(s), contact: s.contact || "" };
}

/** The account a member's bill goes to: the runner's own account (a child's: its first guardian), else the account of the same
 *  licence, else the account that made the entries. */
async function recipientOf(env, person, lines) {
  const real = (u) => u && u.status === "active" && !u.demo_until && u.email_verified && !/\.invalid$/i.test(u.email || "");
  const ids = [...new Set(lines.map((r) => r.user_id).filter(Boolean))];
  for (const uid of ids) {
    const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first();
    if (real(u)) return u;
    if (u?.child) {
      const g = await env.DB.prepare(`SELECT u.* FROM track_guardians t JOIN users u ON u.id = t.parent_id WHERE t.child_id = ? ORDER BY t.parent_id LIMIT 1`)
        .bind(uid).first().catch(() => null);
      if (real(g)) return g;
    }
  }
  const lic = /^L(\d+)$/.exec(person)?.[1];
  if (lic) {
    const u = await env.DB.prepare("SELECT * FROM users WHERE licence = ? AND status = 'active' ORDER BY id LIMIT 1").bind(lic).first();
    if (real(u)) return u;
  }
  for (const uid of [...new Set(lines.map((r) => r.by_user).filter(Boolean))]) {
    const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(uid).first();
    if (real(u)) return u;
  }
  return null;
}

/** A member's own view: their persons (their account, their children, their licence). */
async function myAccount(env, user, org, season) {
  const policy = policyOf(await settingsOf(env, org.id));
  const kids = (await childrenOf(env, user.id).catch(() => [])).map((k) => k.id);
  const ids = [user.id, ...kids];
  const lic = /^\d+$/.test(String(user.licence || "")) ? String(user.licence) : "";
  const { results: rows } = await env.DB.prepare(`SELECT x.person, x.first_name, x.last_name, x.price, e.name AS event, e.date, ${CUR} AS cur FROM entries x
      JOIN events e ON e.id = x.event_id LEFT JOIN entry_forms f ON f.event_id = x.event_id
    WHERE x.payer = 'club' AND x.payer_org = ? AND x.state != 'cancelled' AND substr(e.date, 1, 4) = ?
      AND (x.user_id IN (${ids.map(() => "?").join(",")}) OR (? != '' AND x.licence = ?)) ORDER BY e.date`).bind(org.id, season, ...ids, lic, lic).all();
  const persons = [...new Set([...rows.map((r) => r.person), ...(lic ? [`L${lic}`] : [])])];
  const ledger = persons.length ? (await env.DB.prepare(`SELECT kind, amount, ref, note, at, person FROM club_ledger WHERE org_id = ? AND season = ?
    AND person IN (${persons.map(() => "?").join(",")}) ORDER BY at`).bind(org.id, season, ...persons).all()).results : [];
  const carried = rows.reduce((s, r) => s + r.price, 0);
  const repaid = ledger.filter((l) => l.kind === "repaid").reduce((s, l) => s + l.amount, 0);
  const adjust = ledger.filter((l) => l.kind === "adjust").reduce((s, l) => s + l.amount, 0);
  const s = await settingsOf(env, org.id);
  const balance = policy.recover ? carried - repaid - adjust : 0;
  const main = rows[0] || null;
  return { season, cur: rows[0]?.cur || "EUR", recover: policy.recover, mode: policy.mode, carried, repaid, adjust, balance,
    lines: rows.map((r) => ({ event: r.event, date: r.date, runner: `${r.first_name} ${r.last_name}`.trim(), amount: r.price })),
    bills: ledger.filter((l) => l.kind === "bill").map((l) => ({ at: l.at, amount: l.amount, ref: l.ref })),
    ref: main ? memberRef(org, main.person, main.first_name, main.last_name) : lic ? memberRef(org, `L${lic}`) : "",
    bank: balance > 0 ? BANK(s) : null };
}

// ---- statements between clubs ----------------------------------------------------------------------------------------------
async function statement(env, from, to, season) {
  const os = await orgsByIds(env, [from, to]);
  const { results } = await env.DB.prepare(`SELECT x.id, x.first_name, x.last_name, x.class_id, x.price, x.pay_state, x.paid_how, x.order_ref, x.event_id,
      e.name AS event, e.date, ${CUR} AS cur, f.classes FROM entries x JOIN events e ON e.id = x.event_id LEFT JOIN entry_forms f ON f.event_id = x.event_id
    WHERE e.org_id = ? AND x.payer = 'club' AND x.payer_org = ? AND x.state != 'cancelled' AND substr(e.date, 1, 4) = ? ORDER BY e.date, x.last_name, x.first_name`)
    .bind(from, to, season).all();
  const cls = (r) => { try { return (JSON.parse(r.classes || "[]").find((c) => c.id === r.class_id) || {}).name || r.class_id; } catch (e) { return r.class_id; } };
  const s = await settingsOf(env, from);
  const total = {}, due = {};
  for (const r of results) { add(total, r.cur, r.price); if (r.pay_state === "due") add(due, r.cur, r.price); }
  return { from: orgView(os.get(from)), to: orgView(os.get(to)), season, bank: BANK(s), contact: s.contact || "", total, due,
    lines: results.map((r) => ({ id: r.id, event: r.event, ev: r.event_id, date: r.date, runner: `${r.first_name} ${r.last_name}`.trim(), cls: cls(r),
      amount: r.price, cur: r.cur, state: r.pay_state, how: r.paid_how, ref: r.order_ref })) };
}

async function mark(env, user, org, b) {
  const payer = Number(b.payer), season = SEASON.test(String(b.season || "")) ? String(b.season) : parisToday().slice(0, 4);
  if (!Number.isInteger(payer) || payer <= 0) return no("bad request");
  const state = ["paid", "due"].includes(b.state) ? b.state : "paid";
  const how = state === "paid" ? (["transfer", "cash", "cheque", "card", "club", "other", "netting"].includes(b.how) ? b.how : "transfer") : "";
  const evs = Array.isArray(b.events) && b.events.length ? b.events.map(String).slice(0, 200) : null;
  const now = nowIso();
  const { results } = await env.DB.prepare(`UPDATE entries SET pay_state = ?, paid_at = ?, paid_by = ?, paid_how = ?, updated_at = ?
    WHERE payer = 'club' AND payer_org = ? AND state != 'cancelled' AND pay_state = ?
      AND event_id IN (SELECT id FROM events WHERE org_id = ? AND substr(date, 1, 4) = ?) ${evs ? `AND event_id IN (${evs.map(() => "?").join(",")})` : ""}
    RETURNING event_id`).bind(state, state === "due" ? null : now, state === "due" ? null : user.id, how, now, payer, state === "paid" ? "due" : "paid",
    org.id, season, ...(evs || [])).all();
  for (const e of new Set(results.map((r) => r.event_id))) await touch(env, e);
  return json({ ok: true, changed: results.length });
}

// ---- the bank statement's lines ----------------------------------------------------------------------------------------------
/** The references still open: the club's events' entries due (last 13 months), its members' bills not settled. */
async function openRefs(env, org) {
  const since = new Date(Date.now() - 400 * 86400e3).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(`SELECT x.order_ref AS ref, x.event_id, e.name AS event, e.date, ${CUR} AS cur, SUM(x.price) AS due, COUNT(*) AS n,
      MAX(x.payer) AS payer, MAX(x.payer_org) AS payer_org, MAX(x.payer_user) AS payer_user,
      GROUP_CONCAT(x.first_name || ' ' || x.last_name, '|') AS names
    FROM entries x JOIN events e ON e.id = x.event_id LEFT JOIN entry_forms f ON f.event_id = x.event_id
    WHERE e.org_id = ? AND x.pay_state = 'due' AND x.state != 'cancelled' AND x.price > 0 AND e.date >= ? GROUP BY x.order_ref, x.event_id ORDER BY e.date`)
    .bind(org.id, since).all();
  const users = new Map(), orgs = await orgsByIds(env, results.map((r) => r.payer_org));
  for (const uid of [...new Set(results.map((r) => r.payer_user).filter(Boolean))]) {
    const u = await env.DB.prepare("SELECT first_name, last_name FROM users WHERE id = ?").bind(uid).first();
    if (u) users.set(uid, `${u.first_name} ${u.last_name}`.trim());
  }
  const refs = results.map((r) => ({ kind: "entry", ref: r.ref, event: r.event_id, eventName: r.event, date: r.date, cur: r.cur, due: r.due, n: r.n,
    names: [...new Set([...String(r.names || "").split("|"), users.get(r.payer_user), r.payer === "club" ? orgs.get(r.payer_org)?.name : null].filter(Boolean))] }));
  // the members' bills: the last bill of each person with something left to pay
  const policy = policyOf(await settingsOf(env, org.id));
  const bills = [];
  if (policy.recover) {
    const { results: bs } = await env.DB.prepare(`SELECT person, season, ref, MAX(at) AS at FROM club_ledger WHERE org_id = ? AND kind = 'bill' AND amount > 0
      GROUP BY person, season`).bind(org.id).all();
    for (const x of bs) {
      const a = await memberAccount(env, org, x.person, x.season);
      if (a.balance > 0) bills.push({ kind: "bill", ref: x.ref || a.ref, person: x.person, season: x.season, due: a.balance, cur: a.cur, names: [a.name], eventName: "", date: x.at.slice(0, 10) });
    }
  }
  return { refs: [...refs, ...bills] };
}

async function bankPay(env, user, org, b) {
  const how = ["transfer", "cash", "cheque", "card", "other"].includes(b.how) ? b.how : "transfer";
  const now = nowIso();
  let entries = 0, repaid = 0;
  const touched = new Set();
  for (const it of (Array.isArray(b.items) ? b.items : []).slice(0, 500)) {
    const ref = String(it?.ref || "").toUpperCase().replace(/\s+/g, "");
    if (!/^OZ-[A-Z0-9]{4}$/.test(ref)) continue;
    const { results } = await env.DB.prepare(`UPDATE entries SET pay_state = 'paid', paid_at = ?, paid_by = ?, paid_how = ?, updated_at = ?
      WHERE order_ref = ? AND pay_state = 'due' AND state != 'cancelled' AND event_id IN (SELECT id FROM events WHERE org_id = ?) RETURNING event_id`)
      .bind(now, user.id, how, now, ref, org.id).all();
    entries += results.length;
    for (const r of results) touched.add(r.event_id);
  }
  for (const it of (Array.isArray(b.bills) ? b.bills : []).slice(0, 500)) {
    const ref = String(it?.ref || "").toUpperCase().replace(/\s+/g, "");
    const amount = Math.round(Number(it?.amount));
    if (!/^OZ-[A-Z0-9]+-[A-Z0-9]+$/.test(ref) || !Number.isInteger(amount) || amount <= 0 || amount > 1e8) continue;
    const bl = await env.DB.prepare("SELECT person, user_id, season FROM club_ledger WHERE org_id = ? AND kind = 'bill' AND ref = ? ORDER BY id DESC LIMIT 1").bind(org.id, ref).first();
    if (!bl) continue;
    const note = clean(`${it.date || ""} ${it.label || ""}`, 200);
    const dup = await env.DB.prepare("SELECT 1 FROM club_ledger WHERE org_id = ? AND person = ? AND kind = 'repaid' AND amount = ? AND ref = ? AND note = ?")
      .bind(org.id, bl.person, amount, ref, note).first();
    if (dup) continue;
    await env.DB.prepare("INSERT INTO club_ledger (org_id, person, user_id, kind, amount, season, ref, note, at, by_user) VALUES (?, ?, ?, 'repaid', ?, ?, ?, ?, ?, ?)")
      .bind(org.id, bl.person, bl.user_id, amount, bl.season, ref, note, now, user.id).run();
    repaid++;
  }
  for (const e of touched) await touch(env, e);
  return json({ ok: true, entries, repaid });
}

// ---- the ledger and the year-end bill ----------------------------------------------------------------------------------------
async function ledgerAdd(env, user, org, b) {
  const person = clean(b.person, 200), kind = ["repaid", "adjust"].includes(b.kind) ? b.kind : null;
  const amount = Math.round(Number(b.amount)), season = SEASON.test(String(b.season || "")) ? String(b.season) : null;
  if (!person || !kind || !season || !Number.isInteger(amount) || !amount || Math.abs(amount) > 1e8 || (kind === "repaid" && amount < 0)) return no("bad request");
  const known = await env.DB.prepare("SELECT user_id FROM entries WHERE person = ? AND payer_org = ? ORDER BY id DESC LIMIT 1").bind(person, org.id).first();
  const r = await env.DB.prepare(`INSERT INTO club_ledger (org_id, person, user_id, kind, amount, season, ref, note, at, by_user) VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?)
    RETURNING id`).bind(org.id, person, known?.user_id ?? null, kind, amount, season, clean(b.note, 200), nowIso(), user.id).first();
  return json({ ok: true, id: r.id });
}

async function bill(env, user, org, b) {
  const person = clean(b.person, 200), season = SEASON.test(String(b.season || "")) ? String(b.season) : null;
  if (!person || !season) return no("bad request");
  if (!(await allow(env, `acc:bill:${org.id}`, 300, 86400))) return no("too many", 429);
  const a = await memberAccount(env, org, person, season);
  if (!a.lines.length && !a.ledger.length) return no("nothing", 404);
  const s = await settingsOf(env, org.id);
  const amount = a.recover ? Math.max(0, a.balance) : 0;
  const { results: made } = await env.DB.prepare("SELECT user_id, by_user FROM entries WHERE payer = 'club' AND payer_org = ? AND person = ? ORDER BY id DESC LIMIT 20")
    .bind(org.id, person).all();
  const to = b.send === false ? null : await recipientOf(env, person, made);
  await env.DB.prepare(`INSERT INTO club_ledger (org_id, person, user_id, kind, amount, season, ref, note, at, by_user) VALUES (?, ?, ?, 'bill', ?, ?, ?, ?, ?, ?)`)
    .bind(org.id, person, to?.id ?? null, amount, season, a.ref, a.recover ? "" : "info", nowIso(), user.id).run();
  let sent = "none";
  if (to) {
    const pdf = typeof b.pdf === "string" && b.pdf.length < 2_000_000 && /^[A-Za-z0-9+/=]+$/.test(b.pdf) ? b.pdf : null;
    const mail = (attached) => billMail(env, to, { club: org.name, season, cur: a.cur, recover: a.recover, lines: a.lines, carried: a.carried,
      repaid: a.repaid + a.adjust, balance: amount, ref: a.ref, bank: BANK(s), attached });
    const replyTo = emailOf(s.contact) || null;
    const msg = (m) => ({ to: to.email, subject: m.subject, html: m.html, text: m.text, kind: "accounts", priority: 0, ...(replyTo ? { replyTo } : {}) });
    // with its PDF at once; else (no PDF, or no provider free now) queued without it: the message lists every line
    const r = pdf ? await sendNow(env, { ...msg(mail(true)), attachments: [{ filename: `${a.ref}-${season}.pdf`, content: pdf }] }).catch(() => "failed") : null;
    sent = r === "sent" ? "sent" : await sendOrQueue(env, msg(mail(false)));
  }
  return json({ ok: true, ref: a.ref, amount, sent });
}

// ---- reminders -------------------------------------------------------------------------------------------------------------------
async function remind(env, user, org, b, season) {
  if (!(await allow(env, `acc:remind:${org.id}`, 6, 86400))) return no("too many", 429);
  const evs = Array.isArray(b.events) && b.events.length ? b.events.map(String).slice(0, 100) : null;
  const s = await settingsOf(env, org.id);
  const { results } = await env.DB.prepare(`SELECT x.event_id, x.payer, x.payer_org, x.payer_user, x.order_ref, x.price, x.first_name, x.last_name,
      e.name AS ev_name, e.date AS ev_date, e.org_id, ${CUR} AS cur, f.pay FROM entries x JOIN events e ON e.id = x.event_id LEFT JOIN entry_forms f ON f.event_id = x.event_id
    WHERE e.org_id = ? AND x.pay_state = 'due' AND x.state = 'entered' AND x.price > 0 AND substr(e.date, 1, 4) = ?
      ${evs ? `AND x.event_id IN (${evs.map(() => "?").join(",")})` : ""}`).bind(org.id, season, ...(evs || [])).all();
  const groups = new Map();
  for (const r of results) {
    const k = r.payer === "club" && r.payer_org ? `o${r.payer_org}|${r.event_id}` : r.payer_user ? `u${r.payer_user}|${r.event_id}` : null;
    if (!k || (r.payer === "club" && b.clubs === false)) continue;
    if (!groups.has(k)) groups.set(k, { ...r, amount: 0, runners: [] });
    const g = groups.get(k);
    g.amount += r.price; g.runners.push(`${r.first_name} ${r.last_name}`.trim());
  }
  const stmts = [], push = pushReady(env), replyTo = emailOf(s.contact) || null;
  const evBank = new Map();
  let people = 0;
  for (const [k, g] of groups) {
    if (!(await allow(env, `acc:rem:${org.id}:${k}`, 1, 3 * 86400))) continue;
    if (!evBank.has(g.event_id)) {
      const ev = await env.DB.prepare("SELECT * FROM events WHERE id = ?").bind(g.event_id).first();
      evBank.set(g.event_id, ev ? await orgBank(env, ev, await loadForm(env, g.event_id)) : null);
    }
    const bank = evBank.get(g.event_id);
    let pay = {};
    try { pay = JSON.parse(g.pay || "{}"); } catch (e) { pay = {}; }
    let to = [];
    let payerClub = null;
    if (k.startsWith("o")) {
      const po = await orgById(env, g.payer_org);
      payerClub = po?.name || "";
      const { results: ms } = await env.DB.prepare("SELECT u.*, m.roles AS m_roles FROM org_members m JOIN users u ON u.id = m.user_id WHERE m.org_id = ? AND m.state = 'ok'")
        .bind(g.payer_org).all();
      const tre = ms.filter((u) => roleSet(u.m_roles).has("treasurer"));
      to = tre.length ? tre : ms.filter((u) => roleSet(u.m_roles).has("manager"));
    } else {
      const u = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(g.payer_user).first();
      if (u) to = [u];
    }
    const r = { club: org.name, event: g.ev_name, date: g.ev_date, cur: g.cur, amount: g.amount, ref: g.order_ref, bank, desk: !!pay.desk, payerClub, runners: g.runners };
    for (const u of to) {
      if (u.status !== "active" || u.demo_until) continue;
      if (u.email_verified && !/\.invalid$/i.test(u.email || "")) {
        const m = payReminderMail(env, u, r);
        stmts.push(queueStatement(env, { to: u.email, subject: m.subject, html: m.html, text: m.text, kind: "accounts", priority: 0, ...(replyTo ? { replyTo } : {}) }));
      }
      if (push) stmts.push(queuePush(env, u.id, "accounts", payReminderPush(userLang(u), r), { topic: `pay-${g.order_ref}`.slice(0, 32), hours: 72 }));
      people++;
    }
  }
  if (stmts.length) await env.DB.batch(stmts);
  await Promise.allSettled([flushQueue(env, 10), flushPush(env, 8)]);
  return json({ ok: true, payers: groups.size, told: people });
}

// ---- netting -------------------------------------------------------------------------------------------------------------------
async function settle(env, user, org, b) {
  const other = Number(b.other), season = SEASON.test(String(b.season || "")) ? String(b.season) : parisToday().slice(0, 4);
  if (!Number.isInteger(other) || !(await nettingAccepted(env, org.id, other))) return no("netting", 403);
  const now = nowIso();
  const one = (organiser, payer) => env.DB.prepare(`UPDATE entries SET pay_state = 'paid', paid_at = ?, paid_by = ?, paid_how = 'netting', updated_at = ?
    WHERE payer = 'club' AND payer_org = ? AND pay_state = 'due' AND state != 'cancelled'
      AND event_id IN (SELECT id FROM events WHERE org_id = ? AND substr(date, 1, 4) = ?) RETURNING event_id`).bind(now, user.id, now, payer, organiser, season).all();
  const a = await one(org.id, other), c = await one(other, org.id);
  for (const e of new Set([...a.results, ...c.results].map((r) => r.event_id))) await touch(env, e);
  return json({ ok: true, received: a.results.length, paid: c.results.length });
}

// ---- the policy, event by event ----------------------------------------------------------------------------------------------
async function eventsOf(env, org, season) {
  const policy = policyOf(await settingsOf(env, org.id));
  const today = parisToday();
  const { results } = await env.DB.prepare(`SELECT e.id, e.name, e.date, e.club, e.org_id, f.state AS fstate,
      (SELECT COUNT(*) FROM entries x WHERE x.event_id = e.id AND x.org_id = ? AND x.state != 'cancelled') AS n,
      (SELECT COUNT(*) FROM entries x WHERE x.event_id = e.id AND x.payer = 'club' AND x.payer_org = ? AND x.state != 'cancelled') AS carried,
      (SELECT COUNT(*) FROM entries x WHERE x.event_id = e.id AND x.org_id = ? AND x.payer = 'runner' AND x.pay_state = 'due' AND x.state != 'cancelled') AS dueRunner
    FROM events e JOIN entry_forms f ON f.event_id = e.id WHERE e.status = 'active' AND COALESCE(e.org_id, 0) != ?
      AND ((f.state IN ('open', 'closed') AND e.date >= ?) OR (substr(e.date, 1, 4) = ? AND EXISTS (SELECT 1 FROM entries x WHERE x.event_id = e.id AND x.org_id = ?)))
    ORDER BY e.date LIMIT 300`).bind(org.id, org.id, org.id, org.id, today, season, org.id).all();
  return { policy, events: results.map((e) => ({ ...e, carries: carriesEvent(policy, e), past: e.date < today })) };
}

/** The policy applied again to the club's members' entries still due at one event (after the treasurer ticked it). */
async function apply(env, request, org, b) {
  const evId = String(b.event || "");
  const ev = await env.DB.prepare("SELECT * FROM events WHERE id = ? AND status = 'active'").bind(evId).first();
  if (!ev) return no("not found", 404);
  const { results } = await env.DB.prepare(`SELECT * FROM entries WHERE event_id = ? AND state != 'cancelled' AND pay_state = 'due'
    AND (org_id = ? OR payer_org = ?)`).bind(ev.id, org.id, org.id).all();
  let changed = 0;
  for (const x of results) {
    const who = await payerFor(env, request, x, ev);
    const club = who.payer === "club" && who.org;
    if (club && x.payer === "club" && x.payer_org === who.org) continue;
    if (!club && x.payer === "runner") continue;
    const payerUser = club ? null : x.payer_user ?? x.by_user ?? x.user_id ?? null;
    const key = club ? `o${who.org}` : payerUser ? `u${payerUser}` : `p${x.person}`.slice(0, 120);
    const ref = await refFor(env, ev.id, key);
    await env.DB.prepare("UPDATE entries SET payer = ?, payer_org = ?, payer_user = ?, order_ref = ?, updated_at = ? WHERE id = ?")
      .bind(club ? "club" : "runner", club ? who.org : null, payerUser, ref, nowIso(), x.id).run();
    changed++;
  }
  if (changed) await touch(env, ev.id);
  return json({ ok: true, changed });
}

// ---- the journal --------------------------------------------------------------------------------------------------------------
async function journal(env, org, season) {
  const { results: rows } = await env.DB.prepare(`SELECT x.id, x.first_name, x.last_name, x.licence, x.person, x.club_name, x.club_code, x.price, x.pay_state, x.paid_how,
      x.paid_at, x.order_ref, x.payer, x.payer_org, x.state, e.id AS ev, e.name AS event, e.date, e.org_id, ${CUR} AS cur
    FROM entries x JOIN events e ON e.id = x.event_id LEFT JOIN entry_forms f ON f.event_id = x.event_id
    WHERE (e.org_id = ? OR (x.payer = 'club' AND x.payer_org = ?)) AND x.state != 'cancelled' AND substr(e.date, 1, 4) = ? ORDER BY e.date, e.id, x.last_name`)
    .bind(org.id, org.id, season).all();
  const os = await orgsByIds(env, rows.map((r) => r.payer_org));
  const { results: ledger } = await env.DB.prepare("SELECT person, kind, amount, ref, note, at FROM club_ledger WHERE org_id = ? AND season = ? ORDER BY at").bind(org.id, season).all();
  return { season, rows: rows.map((r) => ({ side: r.org_id === org.id ? "organiser" : "carried", date: r.date, event: r.event, ev: r.ev, runner: `${r.first_name} ${r.last_name}`.trim(),
    person: r.person, licence: r.licence, club: r.club_name || r.club_code, amount: r.price, cur: r.cur, payer: r.payer === "club" ? os.get(r.payer_org)?.name || "" : "",
    state: r.pay_state, how: r.paid_how, paidAt: r.paid_at, ref: r.order_ref })), ledger };
}
