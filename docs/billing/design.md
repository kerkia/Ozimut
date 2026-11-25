# Ozimut's own plans and billing — the contract

Built 2026-11-25 (owner: « build the entire solution, in a way that what is not free can evolve easily, just without making
it visible to anyone yet »), after Part A of the study `C:\Kerkia\Ozimut\work\study\payments`. **Change this file first, then
the code.** What the owner must do himself, what is built and what remains: `docs/billing/owner.md`.

Money paid **to Ozimut**: the individual plan « Plus » (a yearly subscription by card or SEPA debit, through Stripe), the
« Club » plan and the federation or league agreements (an invoice paid by bank transfer, no Stripe), and two things sold by
the unit (one event, generated map beyond the allowance). Race entries and the clubs' own accounts (docs/clubs/design.md)
are payments between people and clubs, outside this.

## 1. The switch: nothing visible until it is turned

`BILLING` (wrangler.toml var): **"off"** (deployed), "test", "live".

- **off**: nobody sees anything — administrators included. `/api/billing/*` answers `404 { error: "off" }` (the webhook
  too), `/api/admin/billing` answers the same, `offers.js` draws only what it draws today (the « Tarifs » table of the home
  page, the rules' sentence), no route, menu entry, tab, mark or e-mail of this document exists. The entitlements are still
  computed and enforced (packaging « launch »: today's limits for everyone), so the code paths are live and nothing changes.
- **test**: as live, but only for administrators and the accounts whose `users.preview` names `billing`; Stripe's sandbox
  keys. Everyone else: as off.
- **live**: everyone.

`functions/_lib/plans.js`: `billingMode(env)`, `billingOn(env, user)` (may this account see and use billing?). The browser
gets `billing: true` in `/api/account/me` only when `billingOn`; `/api/account/status` gives `billing: true` only when live
(the public pricing page).

## 2. Plans, capabilities, packaging — all data

`functions/_lib/plans.js` (the one place; the browser never holds the tables, only its own answers).

**Plans**: `free`, `plus` (a person), `club` (an org), federation levels `fed-clubs` (every club of the federation has
`club`) and `fed-all` (also every licensee has `plus`).

**Capabilities** (`CAPS`): a key, a kind (`flag` | `limit`), a unit, the module it belongs to. Features name capabilities,
never plans. The catalogue today:

| key | kind | what |
|---|---|---|
| `mymapsMB` | limit | Mes cartes: storage (MB) — `/api/mymaps` quota |
| `lidarPerDay` | limit | LiDAR map requests a day — `/api/lidarmap` |
| `townPerDay` | limit | town plan requests a day — `/api/townmap` |
| `genKm2Month` | limit | generated map km² a month (null = no monthly cap); beyond it, credits (§7) |
| `aiPerDay` | limit | « IA » questions a day on Ozimut's model — `/api/ask` |
| `aiStrong` | flag | « IA » on the stronger model |
| `cartoVersions` | limit | Cartographier: saved versions kept a map (null = no limit) — `/api/mapper` |
| `routesOwnSpeeds` | flag | computed routes adjusted on one's own legs (the analyses' « Calcul ») |
| `routeVariants` | flag | route variants on the analyses |
| `headcamVideo` | flag | the headcam video on the analyses |
| `analysisExport` | flag | image export on the analyses |
| `pixelOwnMap` | flag | Pixel: an event on one's own map |
| `orgmapsMB` | limit (org) | the club's map library (MB) — `/api/orgmaps` |
| `chronoCompetition` | flag (org, event) | Chrono for a competition |

A new paid thing = a new row here and a check at its place; never a plan test in a feature's code.

**Packaging** (`PACKS`): for each capability its value per plan — `free`, `plus`, `club` (the org's own), `member` (what a
club's plan gives each of its members in force), `participant` (what it opens to everyone on that club's events and
analyses), `u21` (the club's members under 21: by default the whole of `plus`). Two packs are written in the code:

- **`launch`** — today: every flag true for `free`, every limit at today's value (1024 MB, 5, 3, null, 15, 60, 3072 MB;
  `aiStrong` false). This is what runs until the owner changes it.
- **`v1`** — the study's first packaging (A1's table): `free` keeps taking part (limits as today), `plus` holds
  `mymapsMB` 25600, `lidarPerDay` 20, `townPerDay` 10, `genKm2Month` 60 (free 10), `aiPerDay` 100, `aiStrong`,
  `cartoVersions` null, `routesOwnSpeeds`, `routeVariants`, `headcamVideo`, `analysisExport`, `pixelOwnMap`; `club` holds
  `chronoCompetition`, `orgmapsMB` 20480, and opens the four analysis flags to `participant`.

The pack in force and any change to it live in D1 `billing_config` (key `pack`: `{ base: "launch" | "v1", set: { <cap>:
{ <plan>: value } } }`), edited in the admin tab « Formules » — moving a capability between plans, changing a limit or going
from `launch` to `v1` is an administrator's click, no deploy. `packOf(env)` reads it (cached 60 s an isolate); without the
table or the row: `launch`.

**Prices and the seller** are data too (`billing_config` keys `prices`, `seller`, `sell`, `texts`):

```
prices: { plus: { year: 2900, founder: 1900, founderUntil: "YYYY-MM-DD" | "", stripe: { year: "price_…", founder: "price_…" } },
          club: { year: 12000, small: 9000, smallMax: 50 },
          fed: { clubs: 60, all: 200 },                      // cents per licensee a year
          event: { perEntry: 20, cap: 2500 },
          mapPack: { km2: 10, amount: 1000, stripe: "price_…" },
          trialDays: 30, currency: "eur" }
seller: { name, form, capital, address, country, siren, siret, rcs, vat, vatNote, iban, bic, email, mediator, mediatorUrl }
sell:   { individuals: "none" | "fr" | "eu" | "all", mor: { on: false, countries: [], params: {} } }
```

Defaults (in plans.js) are the study's figures with every `stripe` id empty and `seller` empty; **amounts are in cents,
euros**. `vatNote` is printed on invoices (« TVA non applicable, art. 293 B du CGI » under the franchise); `vat` (a rate,
0 by default) is applied to club invoices when set. `sell.mor` passes extra Checkout parameters for buyers outside the EU
once Stripe's merchant-of-record option has been tried (owner.md).

## 3. Entitlements

`entitlementsOf(env, user, ctx?)` → `{ plan, caps: { key: value }, why: { key: { scope, plan, name, until } }, trial: { until } | null }`.
It looks at four scopes and keeps the most generous value of each capability (true over false, the larger limit, null =
unlimited over any number):

1. **the person**: an active `subscriptions` row of subject `u<id>`; `grants` of subject `u<id>` in force.
2. **their clubs**: for each org the account belongs to in force (`_lib/orgs.js orgsOf`), that org's plan (subscription or
   grant of subject `o<id>`) gives the pack's `member` values — and `u21` to a member whose licence category is under 21.
3. **the federation**: a grant of subject `f<CC>` (a country's federation) covers the accounts holding an accepted
   membership of that country (France: a licence) — `fed-all` gives them `plus`, both levels give their clubs `club`; a
   grant of subject `fo<org id>` (a league or committee) covers the clubs whose `orgs.parent` is that org, and their members.
4. **the context** (`ctx: { org, event, analysis }`): the plan of the org holding the event or the analysis gives the
   pack's `participant` values; a grant of subject `e<event id>` (an event bought by the unit) gives that event `club`'s own
   and `participant` values.

`orgPlan(env, orgId)` → `{ plan, until, why }` for an org; `entCaps(env, user)` for `/api/account/me`; `capOf(env, user,
key, ctx?)`. Administrators keep today's exemptions where the code has them (they are not « on a plan »).

**Rules**: the server enforces what has an API (`mymapsMB`, `lidarPerDay`, `townPerDay`, `genKm2Month`, `aiPerDay`,
`aiStrong`, `cartoVersions`, `orgmapsMB`); what is computed in the browser (the four analysis flags, `pixelOwnMap`,
`chronoCompetition`) is shown or not by the page from the same answers. A refusal for a plan reason is `402 { error: "plan",
cap, need }` (a storage quota keeps `413 { error: "quota", …, cap }`). **Losing a plan never loses data**: past a limit an
account can view, export and delete, not add.

`/api/account/me` and the login add `ent: { caps, why }` (always) and `billing`, `plan`, `trial` (only when `billingOn`).
An event's or analysis's API adds `opened: { caps: [keys], by: "<club name>" }` when its organiser's plan opens something
to participants. Browser: `auth.can(key, opened?)`, `auth.limit(key)`, `auth.capWhy(key)` (auth.js; no selling word).

## 4. Data (migration `0034_billing.sql`)

`billing_config` (k, json, updated_at, updated_by) · `billing_customers` (subject, stripe_customer, country, consent_at)
· `subscriptions` (subject PK, plan, status, period, current_start, current_end, cancel_at_end, stripe_sub, price_id,
amount, first_paid_at, renew_notice, ended_at, source `stripe` | `invoice`) · `grants` (id, subject, plan, until, reason
`trial` | `founder` | `gift` | `staff` | `agreement` | `event` | `trust` | `pilot`, note, by_user, created_at, ended_at) ·
`billing_events` (event_id unique, type, at, ok, note, body) · `usage_counters` (subject, k, period, n) ·
`usage_credits` (subject, k, n, source) · `billing_codes` (code_hash, plan, days, max_uses, uses, expires, note) ·
`billing_code_uses` (code_hash, subject) · `org_billing` (org_id, name, address, country, siret, vat_id, email, updated…) ·
`invoices` (id, number unique, kind `invoice` | `credit` | `quote`, subject, org_id, lines JSON, net, vat, total, currency,
status `draft` | `issued` | `paid` | `cancelled`, issued_at, due_at, paid_at, paid_how, ref, of_invoice, seller JSON,
buyer JSON, note) · `invoice_seq` (year, n) · `billing_funnel` (day, step, k, n) · `billing_notices` (subject, kind, ref —
an e-mail sent once).

A subject is `u<user id>`, `o<org id>`, `e<event id>`, `f<CC>`, `fo<org id>`. Every route answers `503 { error: "not
ready" }` before the migration (after the switch's 404).

## 5. Individuals: Stripe (functions/_lib/stripe.js, functions/api/billing/[[path]].js)

No SDK: `fetch` to `api.stripe.com`, form-encoded, a pinned `Stripe-Version`, an idempotency key on every write; the
webhook's signature checked with WebCrypto (HMAC-SHA-256 of `t.body`, constant-time compare, 5 minutes of tolerance).
Secrets (the owner's, never asked nor printed): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

| Route | |
|---|---|
| `GET /api/billing` | the account's state: `{ plan, sub, trial, grants, why, prices (display), canTrial, withdrawUntil, invoices, orgs: [{ id, name, plan, until, may }] }` |
| `GET /api/billing/offer` | public when live: `{ prices, plans: [{ id, caps }], capsText keys }` — what the pricing page draws |
| `POST /api/billing/trial` | the 30-day trial: a grant `u<id>` `plus` reason `trial`, once an account ever; no card |
| `POST /api/billing/checkout` | `{ plan: "plus", startNow: true }` → `{ url }` (Stripe Checkout, mode subscription, the price `year` or `founder`); `startNow` is the buyer's express request to start during the withdrawal period (kept in `billing_customers.consent_at`) — required |
| `POST /api/billing/portal` | `{ url }` — Stripe's Customer Portal (payment method, invoices) |
| `POST /api/billing/cancel` · `/resume` | termination at the period's end (`cancel_at_period_end`), and back |
| `POST /api/billing/withdraw` | within 14 days of the first payment: the subscription ends now, refund of the unused share (amount × days left / days of the period) |
| `POST /api/billing/code` | `{ code }` → a grant from `billing_codes` |
| `POST /api/billing/pack` | `{ k: "mapPack" }` → `{ url }` (Checkout, mode payment) — credits on payment |
| `POST /api/billing/seen` | `{ step, k }` the funnel's counts (no account kept) |
| `POST /api/billing/webhook` | public in the gate (no session; its signature is its proof). On `checkout.session.completed`, `customer.subscription.*`, `invoice.*`, `charge.refunded`, `charge.dispute.*`: the subscription is **read again from Stripe** and the whole row written; each event applied once (`billing_events`) |

The login gate refuses the Ozimut app everything under `/api/billing` (already) — but `GET /api/billing` answers the app
`{ plan, why }` only (the plan's state, no price, no link). The daily check (`billingDaily`, from `/api/track`'s hooks, once
a day site-wide): Stripe's active subscriptions against D1, differences repaired and mailed to the administrators; the
trial's end notice (3 days before), the renewal notice (between 60 and 30 days before `current_end`, once), club invoices'
reminders; grants and subscriptions past their end closed.

Account deletion: the Stripe subscription cancelled at once, `billing_customers`, `grants`, counters and credits of the
subject deleted; `billing_events` keep no personal data (ids only).

## 6. Clubs, leagues, federations: invoices by bank transfer

`/api/billing/org/<id>` (a manager or treasurer of the org, `_lib/orgs.js can`):

- `GET` → `{ org, plan, until, why, billing (org_billing), invoices, price, members: n, eventsUnit: [...] }`
- `PUT` `{ billing: { name, address, country, siret, vat_id, email } }`
- `POST …/quote` → a quote (kind `quote`, no number of the invoice series, valid 60 days)
- `POST …/order` `{ plan: "club" }` → an invoice **issued** at once (numbered `OZ-<year>-<nnnn>`, sequential without gaps,
  never modified — a correction is a credit note), due in 30 days, its reference the invoice number; the plan starts at once
  **on trust** (a grant `o<id>` reason `trust`, 30 days). When an administrator marks the invoice paid, a `subscriptions` row
  (source `invoice`) runs one year from the order's day and the trust grant ends.
- `GET …/invoice/<id>` → the stored record (seller and buyer as they were when issued); the PDF is drawn in the browser from
  it (pdf-lib, as the clubs' year-end bills).
- `POST /api/billing/event/<event id>` (the event's team): the event bought by the unit — a grant `e<id>` reason `event`;
  after the event an administrator's « Facturer » makes the invoice to the event's club from its entries (`perEntry`, `cap`).

A federation or league agreement is entered by an administrator (admin API): a grant `f<CC>` or `fo<org id>` with its level
and end day, and optionally an invoice.

## 7. Metered: generated maps

When the pack gives `genKm2Month` a number, `/api/lidarmap` and `/api/townmap` count the km² of what they newly make in
`usage_counters` (`u<id>`, `genKm2`, `YYYY-MM`) — a LiDAR tile newly asked 1 km², a town plan its area — and refuse beyond
the allowance plus the account's `usage_credits` (`402 { error: "plan", cap: "genKm2Month", used, limit, credits }`), credits
being used after the allowance. `null` (the `launch` pack): no monthly count, the per-day limits alone, as today.

## 8. The administrators (functions/api/admin/billing.js, pages/adminbilling.js, tab « Abonnements »)

`GET /api/admin/billing?view=…`, `POST` actions — administrators only, and only when the switch is not off:
`summary` (subscriptions by plan, yearly revenue, trials started and converted, grants in force by reason, failed payments,
buyer countries against the VAT thresholds, the funnel), `subs`, `grants` (add, end), `agreements`, `invoices` (issue for an
org, mark paid / unpaid, credit note, « Facturer » an event), `codes` (make — the code shown once —, list, end), `events`
(the Stripe events, failures first; replay one), `config` (the pack as a table capability × plan, prices, Stripe price ids,
seller, sell, the public « Ce qui change » entries), `check` (run the daily check now), `health` (which secrets and config
are present — names only, never values).

## 9. The site: everything about buying is drawn by the purchase gate

docs/app/design.md's rule stands and is extended: **`site/assets/js/offers.js` and the modules of
`site/assets/js/billing/`** (loaded only through offers.js) are the only code that may draw a price, a plan, a button to
buy, a mark on a feature an account lacks, or name `/api/billing`; their texts are the area `i18n/billing.<lang>.js`
(`bill.*`), four languages. In the Ozimut app every function draws nothing, and a feature the account lacks is absent.
`tools/offer_check.mjs` enforces it (the gate = offers.js, `billing/**`, `i18n/billing.*`; nobody else imports `billing/`).

offers.js's interface for the rest of the site (all safe to call anywhere; all no-ops when billing is not on for the
account or in the app):

- `offers.on()` — billing is on for this visitor.
- `offers.has(key, opened?)` → boolean — may the account use the capability (here)? **True when billing is not on** only
  if the entitlements say so (they always do under `launch`).
- `offers.shown(key, opened?)` → boolean — should the option be drawn at all? (`has`, or billing on outside the app: then it
  is drawn marked.)
- `offers.mark(key, opened?)` → html — the « Plus » / « Club » mark beside an option the account lacks, "" otherwise; and
  « offert par <club> » when a club or federation opened it.
- `offers.guard(key, { opened, el })` → Promise<boolean> — to call when the option is used: true to go on; else it opens the
  sheet in place (what the option does, what else the plan holds, the price, « Essayer 30 jours, sans carte » /
  « S'abonner ») and resolves false. The tool keeps its state.
- `offers.limitNote(key, used)` → html — the quiet line at 80 % of a limit, the explanation at 100 %.
- `offers.refused(error)` — to call with a `402 plan` / `413 quota` answer: explains and offers the sheet.
- `offers.settingsSection()` → html + `bindSettings(root)` — « Réglages › Abonnement » (`#/reglages?onglet=abonnement`): the
  plan, its renewal, payment method and invoices (Stripe's portal), « aussi ouvert pour vous » with who opened it, the trial,
  a code, termination in three clicks (« Résilier » → summary → « Confirmer la résiliation »), withdrawal within 14 days.
- `offers.clubSection(org)` + `bindClub` — « Mon club › Formule » (managers and treasurers): the plan, the billing details,
  quote, order, invoices (PDF), the events bought by the unit.
- `offers.eventNote(ev, form)` — the line in an Orga event about `chronoCompetition`, with « Ouvrir pour cet événement » (the
  event bought by the unit, `POST /api/billing/event/<id>`) when `ev.id` is given.
- `offers.invoicePdf(record, { save = true })` → Promise<Uint8Array | null> — an invoice, credit note or quote drawn as a PDF
  from its stored record (pdf-lib), handed to the reader as « <number>.pdf » unless `save` is false; `offers.invoicePdfName(record)`.
  The admin tab uses it too. `offers.guard` and `offers.refused` never reject (a failure is « no »).
- The app shows one thing of the gate: Réglages' card with the plan the account holds and who opened it
  (`billing/planstate.js`), its words the area `i18n/plan.<lang>.js` (keys `plan.*`, no selling word).
- routes drawn by `billing/pages.js` through offers.js: `#/tarifs` (the pricing page — public when live; the home page's
  table links to it), `#/conditions-de-vente` (terms of sale, `billing/terms.<lang>.js`: individuals and clubs, the
  withdrawal form, the mediator), `#/changements` (« Ce qui change »: the dated entries of the config).

Return from Checkout: `#/reglages?onglet=abonnement&retour=1` shows « activation en cours » and asks `/api/billing` every
2 s for 30 s.

## 10. E-mails (functions/_lib/templates.js, four languages, e-mails only — never a push)

`trialStartMail`, `trialEndMail` (3 days before: nothing happens unless they subscribe), `subscribedMail` (with the
withdrawal right and the terms), `renewalNoticeMail` (the date, the amount, how to terminate — French law's yearly notice),
`paymentFailedMail`, `cancelledMail` (the end date; what stays readable), `withdrawnMail` (the refund), `endedMail`,
`clubInvoiceMail`, `clubInvoiceReminderMail`, `clubPaidMail`, `agreementMail`, `billingAlertMail` (administrators: a
dispute, a webhook failure, the daily check's differences). They count as account e-mails (the alert right does not apply)
and go at once (`URGENT`-like) — a receipt must not wait for a quota.

## 11. Tests and local work

`tools/billing/t_plans.mjs` (the packs and the four scopes on an in-memory D1 stand-in), `tools/billing/t_webhook.mjs`
(signature, duplicates, out-of-order events, unknown customer, replay — against a fake Stripe), `tools/billing/t_invoice.mjs`
(numbering without gaps, credit notes, totals). Launch config `pages-dev-billing` (its own copy of the local state with
0034 applied, `BILLING=test`, a fake Stripe at `STRIPE_API` — `tools/billing/fake_stripe.mjs` — unless sandbox keys are in
`.dev.vars`).
