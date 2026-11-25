# Paid plans: what is built, what remains, and the owner's steps

Written 2026-11-25. The technical contract is `docs/billing/design.md`; the reasons are in the study
(`C:\Kerkia\Ozimut\work\study\payments`, Part A). This page is the checklist: read it top to bottom once, then use
section 4 as the to-do list while the company (SASU) is being created.

**Where things stand**: the whole of Ozimut's own billing is built and deployed **switched off** (`BILLING = "off"` in
`wrangler.toml`). While it is off nobody — administrators included — sees a price, a plan, a tab or a mark, and every
account keeps exactly today's limits. Nothing has been tried against a real Stripe account, a real bank transfer or a real
buyer: the rehearsal of section 5 is where that happens.

## 1. What is built

| Piece | What it does | Where |
|---|---|---|
| The switch | `off` → `test` (administrators and accounts flagged `billing` only, Stripe's sandbox) → `live` | `wrangler.toml` `BILLING`; `_lib/plans.js` |
| Capabilities and packaging as data | Each thing that may be paid is a named capability; which plan holds it, and every limit, is a table an administrator edits (Administration › Abonnements › Formules). Two packagings are written: `launch` (today: everything free) and `v1` (the study's first packaging). Going from one to the other, or moving one capability, is a click — no deploy. | `_lib/plans.js`, D1 `billing_config` |
| Entitlements | One function answers « may this account do this, here? » from four scopes — the person, their clubs, the event's or analysis's organiser, the federation — and keeps the most generous. The server enforces every limit that has an API; the pages show the rest. | `_lib/plans.js` |
| Ozimut Plus (individuals) | A yearly subscription through Stripe Checkout (card, Apple Pay, Google Pay, SEPA debit as enabled in Stripe); the 30-day trial without a card; codes (founders, gifts, pilots); Stripe's portal for the payment method and invoices; termination in three clicks; withdrawal within 14 days with the pro-rata refund; the webhook; a daily check of Stripe against the database. | `_lib/stripe.js`, `_lib/billing.js`, `api/billing` |
| Ozimut Club, leagues, federations | No card: a quote, then an invoice numbered `OZ-<year>-<nnnn>` paid by bank transfer; the plan starts at once on trust for 30 days and runs a year once an administrator marks the invoice paid; credit notes; federation and league agreements entered by an administrator; an event bought by the unit. | `_lib/invoices.js`, `api/billing/org`, `api/billing/event` |
| Generated maps by the unit | A monthly allowance of km² and packs of credits (a one-time Stripe payment) — only when the packaging gives the allowance a number. | `_lib/plans.js`, `api/lidarmap`, `api/townmap` |
| What buyers see | The pricing page `#/tarifs`, the sheet a marked option opens in place, « Réglages › Abonnement », « Mon club › Formule » with invoices as PDF, the terms of sale `#/conditions-de-vente`, « Ce qui change » `#/changements`. All of it inside the purchase gate (`offers.js`, `billing/`), so the Ozimut app never shows any of it. | `site/assets/js/offers.js`, `billing/` |
| Marks inside the tools | The paid options of the `v1` packaging stay visible, marked, and open the sheet; « offert par <club> » where a club's plan opens them. Inert under `launch`. | the analyses, Mes cartes, IA, Carto, Pixel, Orga |
| E-mails | Trial start and end, subscribed, the yearly renewal notice, payment failed, termination, withdrawal, ended; the club's invoice, reminder, paid; agreements; alerts to administrators. Four languages. | `_lib/templates.js` |
| Administration › Abonnements | Figures, the health card (what is still missing, by name), Formules (packaging, prices, the seller's identity, where Ozimut sells), subscriptions, grants, agreements, codes, invoices, Stripe's events with replay, the funnel, buyer countries against the VAT thresholds. | `pages/adminbilling.js`, `api/admin/billing.js` |
| Tests | The packs and scopes, the webhook (signatures, duplicates, order), invoice numbering; a fake Stripe for local rehearsals. | `tools/billing/` |

## 2. How it stays invisible, and how it is turned on

1. `BILLING = "off"` (now): nothing exists for anyone. The entitlements run with the `launch` packaging.
2. `BILLING = "test"`: you and the accounts you flag see everything, against Stripe's **sandbox**. Flag an account with
   `UPDATE users SET preview = trim(preview || ',billing', ',') WHERE email = '…'` (D1 console or
   `npx wrangler d1 execute ocn --remote --command "…"`).
3. `BILLING = "live"`: everyone. The packaging is still whatever « Formules » says: **turning the switch to live does not
   by itself make anything paid** — choosing the `v1` base (or moving capabilities) does. Keep the two decisions apart: go
   live with `launch` first if you want the pages public before anything changes.

Changing the switch is one line in `wrangler.toml` and a push.

## 3. What remains

**Code, later** (none of it blocks the launch of Plus and Club):

- Clubs' own card payments for race entries (the study's Part B: Stripe Connect on each club's account) — not started; it
  waits for the company and a lawyer's written view.
- The paid features that do not exist yet: following runners and clubs, the season report, statistics across one's
  analyses, the club and federation dashboards, Pixel's private competitions. Each is born with its capability key.
- Stripe as merchant of record for buyers outside the EU: the hook exists (`sell.mor`), its parameters are to be found in
  the sandbox (step 4.4). Until then sell to France and the EU only (`sell.individuals = "eu"`).
- A page-level « Plus » mark for features computed in the browser is a courtesy, not a lock: a determined user can call
  them. The limits with a server (storage, map generation, AI, versions) are enforced.
- The four languages of the terms of sale are written; only the French text has legal value until a lawyer says otherwise.

**Never tried for real**: a Stripe account (only the local fake), a SEPA debit, a refund, a dispute, a transfer matched to an
invoice, the e-mails in an inbox, the invoice PDF in front of a treasurer.

**Tried on the PC on 2026-11-25** (fake Stripe, `BILLING=test`, then `off`): with the switch off every billing route answers
404 and Réglages, Mon club and the admin page are as before; with it on, the trial, Checkout to the fake Stripe and its
webhook, a code, a club's quote, invoice and trust period, the admin tab and its health card. Unit tests: 136 on the packs and
scopes, 107 on the webhook, 62 on invoice numbering (`node tools/billing/t_*.mjs`). **Not clicked end to end yet**: « Marquer
impayée », a credit note, a federation agreement, the price ids entered in Formules, the under-21 price's licence lookup on
the server, `BILLING = "live"`. Daily limits (generated maps, AI) keep answering 429 « too many today » as now; only storage
and plan-only options answer 402 with the sheet.

## 4. Your steps, in order

### 4.1 Now, before the company exists

- [ ] Read the packaging `v1` in Administration › Abonnements › Formules on the local server (section 5) and decide what you
      would really charge for. It is data: change it there.
- [ ] Decide the prices (defaults: Plus €29 a year, founders €19 until a date you set; Club €120, €90 up to 50 licensees;
      federation €0.60 / €2 per licensee; an event €0.20 an entry capped at €25; €10 for 10 km² of generated map).
- [ ] Open a Stripe account (stripe.com) with your e-mail. Without a company it stays in **sandbox / test mode**, which is
      all the rehearsal needs. Do the rehearsal of section 5.2.
- [ ] Apply the database migration (tables only; nothing changes for anyone):
      `npx wrangler d1 migrations apply ocn --remote`
- [ ] Talk to the accountant with the questions of section 7.

### 4.2 When the SASU exists

- [ ] Note its identity: name, form and capital, registered office, SIREN / SIRET, RCS city, intra-EU VAT number if any, and
      whether it is under the VAT franchise.
- [ ] A bank account in the company's name; its IBAN and BIC.
- [ ] Professional liability insurance.
- [ ] A consumer mediator (mandatory to sell to individuals in France): join one, note its name and address.
- [ ] The software: a written licence from you to the company, or its contribution to the company (accountant).
- [ ] A lawyer reads `#/conditions-de-vente` (French) and the privacy page's new paragraphs.
- [ ] Fill Administration › Abonnements › Formules › « Vendeur » with all of the above (it prints on invoices and the terms;
      the health card turns green when complete).

### 4.3 Stripe, live

- [ ] Activate the account with the company's documents; set the public business name, support e-mail
      (`contact@ozimut.com`), statement descriptor (« OZIMUT »), branding (logo, the orange).
- [ ] Settings › Payment methods: cards, Apple Pay, Google Pay, SEPA Direct Debit.
- [ ] Settings › Billing › Customer portal: **save its configuration once** (in the sandbox too) — until then Stripe refuses
      to open a portal and « Gérer mon moyen de paiement » fails. Allow updating the payment method and viewing invoices;
      turn **off** cancellation there (termination is in Ozimut, with its legal summary) or leave it on — both work, the
      webhook follows.
- [ ] Settings › Billing › Invoices: the company's legal mentions in the footer (SIREN, RCS, capital; « TVA non applicable,
      art. 293 B du CGI » under the franchise).
- [ ] Settings › Public details: the links to `https://ozimut.com/#/conditions-de-vente` and the privacy page.
- [ ] Products: « Ozimut Plus » with a **recurring yearly** price of €29, and a second yearly price of €19 (founders);
      « Carte générée — 10 km² » with a one-time price of €10. Copy the three price ids (`price_…`) into Formules
      (fields « plus.year », « plus.founder », « mapPack »); the health card shows each one checked against Stripe.
- [ ] Developers › API keys: create a **restricted key** with write on Customers, Checkout Sessions, Subscriptions,
      Customer portal, Refunds and read on Invoices, Charges, Events, Prices. Then, from `C:\Kerkia\Ozimut\Ozimut`:
      `npx wrangler pages secret put STRIPE_SECRET_KEY --project-name observatoire-cn`
- [ ] Developers › Webhooks: add the endpoint `https://ozimut.com/api/billing/webhook` with the events
      `checkout.session.completed`, `checkout.session.async_payment_succeeded` (SEPA debits are confirmed days later),
      `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`,
      `customer.subscription.paused`, `customer.subscription.resumed`, `invoice.paid`, `invoice.payment_succeeded`,
      `invoice.payment_failed`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`. Keep the API version
      of the endpoint at **2024-06-20** (the version the code asks for). Copy its signing secret:
      `npx wrangler pages secret put STRIPE_WEBHOOK_SECRET --project-name observatoire-cn`
- [ ] Stripe's own e-mails: turn on receipts; turn off Stripe's « upcoming renewal » and « trial ending » e-mails (Ozimut
      sends its own, with the legal wording).

### 4.4 Hosting, before real money

- [ ] Cloudflare: Workers Paid (USD 5 a month) — on the free plan the Functions stop at 100 000 requests a day, the webhook
      included.
- [ ] Mail: make sure receipts cannot wait for a quota (Scaleway is already the overflow; check its key's expiry).
- [ ] In the Stripe sandbox, try Stripe's merchant-of-record option for a buyer outside the EU. If it works per Checkout
      session, tell Claude the parameters: they go in Formules › « Vente hors UE ». If not, stay on France and the EU.

### 4.5 Rehearsal on the live site (section 5.3), then the announcement

- [ ] Set `BILLING = "test"`, flag your account and two or three volunteers, play the checklist with sandbox keys.
- [ ] Two months before anything becomes paid: write the entry in Formules › « Ce qui change » (four languages), and send
      the announcement e-mail (to be written with Claude then: why, what stays free, what Plus and Club add, the founders'
      price and its deadline).
- [ ] Open the conversation with the federation **before** the announcement.

### 4.6 Launch day

- [ ] Swap the two secrets for the **live** key and the live webhook secret; put the live price ids in Formules.
- [ ] `BILLING = "live"`, push. Check the health card.
- [ ] One real purchase with your own card, its receipt, a termination, a refund.
- [ ] When the notice period is over: Formules › base `v1` (or your own table) › Enregistrer.

## 5. Rehearsals

### 5.1 On the PC, with the fake Stripe (no account needed)

In the Claude app start the launch configurations `fake-stripe` then `pages-dev-billing` (port 8762), or ask Claude to.
Sign in as the local administrator; Administration › Abonnements shows everything. Set the base to `v1` to see the marks.

### 5.2 On the PC, with Stripe's sandbox

Put the sandbox keys in `.dev.vars` (`STRIPE_SECRET_KEY=sk_test_…`, `STRIPE_WEBHOOK_SECRET=whsec_…`, `BILLING=test`),
install Stripe's CLI and run `stripe listen --forward-to localhost:8788/api/billing/webhook` (it prints the `whsec_…`).
Test cards: `4242 4242 4242 4242` (succeeds), `4000 0000 0000 0341` (fails at renewal), `4000 0027 6000 3184` (asks for
3-D Secure); SEPA test IBAN `FR1420041010050500013M02606`. Stripe's « test clocks » play a year of renewals in minutes.

### 5.3 The checklist (sandbox, then once for real)

- [ ] Trial: started without a card; the marks disappear; the e-mail three days before its end; at its end the free limits
      are back and nothing was lost.
- [ ] Purchase by card, by SEPA debit; the receipt; « Réglages › Abonnement » active within seconds.
- [ ] Renewal after a year (test clock); the notice e-mail one to two months before, with date and amount.
- [ ] A failing renewal: the e-mail, Stripe's retries, the state shown, access kept during the retries, lost at the end.
- [ ] Termination in three clicks; the acknowledgement; access until the paid day; « Reprendre ».
- [ ] Withdrawal on day 3: the refund's amount, the plan ended.
- [ ] A code: made in the admin tab, used once, refused the second time.
- [ ] A club: billing details, quote PDF, order, the invoice PDF read by a treasurer, plan active on trust, marked paid,
      a year from the order; a credit note.
- [ ] A club's member and a participant of its analysis see « offert par <club> ».
- [ ] In the Ozimut app (or with its user agent): no price, no button, no mark anywhere; lacking options absent.
- [ ] The webhook switched off for an hour, then « Lancer le contrôle quotidien »: the difference is repaired.
- [ ] An account deleted while subscribed: the Stripe subscription is cancelled.

## 6. Running it

- **Refund and end a plan**: in Stripe (Payments › refund) and cancel the subscription there; the webhook writes the rest.
- **Paid but no access**: Administration › Abonnements › Événements Stripe, find the failed event, « Rejouer ».
- **The webhook was down**: « Lancer le contrôle quotidien », then read its result.
- **A dispute**: Stripe e-mails you and Ozimut alerts the administrators; answer in Stripe within its deadline with the
  receipt, the terms accepted and the account's use.
- **Change a price**: create a new price in Stripe, put its id in Formules; existing subscribers keep theirs until told
  otherwise (announce a change at least a month before their renewal).
- **A club's transfer arrives**: Factures › « Marquer payée » with the day. No transfer after 30 days: the reminder goes
  by itself once; after that the trust period ends and the club is back on the free plan.
- **Each month**: export Stripe's payouts and the invoices list for the accountant.

## 7. Questions for the accountant and the lawyer

- VAT: is the SASU under the franchise (no VAT charged, « art. 293 B du CGI » on invoices) and until which revenue?
  Sales to consumers elsewhere in the EU under €10,000 a year; **one sale to a UK consumer** triggers UK VAT registration —
  hence selling to France and the EU only at first.
- E-invoicing: which approved platform, and from which date must the company issue electronic invoices to clubs that are
  businesses, and report sales to consumers and associations?
- The clubs (associations without a VAT number): invoice mentions, late-payment mentions.
- Tacit renewal and the yearly notice (Code de la consommation L215-1), termination « en trois clics » (L215-1-1), the
  14-day withdrawal with the express request to start (L221-18, L221-25, L221-28): is the wording of the sheet, of the
  e-mails and of the terms right? Is Stripe Checkout's pay button, with the sentence added above it, enough for the
  « commande avec obligation de paiement » rule (L221-14)?
- Your employment contract: exclusivity, loyalty, intellectual property — and the licence of the software to the company.
- Privacy: Stripe as a processor (the privacy page says so from the day the switch leaves `off`); the billing data kept
  ten years for accounting.
