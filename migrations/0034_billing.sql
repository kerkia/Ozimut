-- Ozimut's own plans and billing (owner, 2026-11-25; docs/billing/design.md): the individual plan through Stripe, the clubs'
-- and federations' invoices by bank transfer, grants (trials, codes, agreements, pilots), the packaging and prices as data.
-- Dark until wrangler.toml's BILLING leaves "off". functions/_lib/plans.js, _lib/stripe.js, api/billing, api/admin/billing.
-- A subject is « u<user id> », « o<org id> », « e<event id> », « f<CC> » (a federation) or « fo<org id> » (a league).

-- the packaging in force, the prices, the seller's identity, where Ozimut sells, the public « Ce qui change » entries
CREATE TABLE billing_config (
  k           TEXT PRIMARY KEY,                    -- pack | prices | seller | sell | texts | changes
  json        TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  INTEGER
);

CREATE TABLE billing_customers (
  subject         TEXT PRIMARY KEY,
  stripe_customer TEXT,
  country         TEXT NOT NULL DEFAULT '',
  consent_at      TEXT,                            -- the express request to start during the withdrawal period
  created_at      TEXT NOT NULL
);
CREATE UNIQUE INDEX billing_customers_stripe ON billing_customers (stripe_customer) WHERE stripe_customer IS NOT NULL;

-- a copy of what Stripe says (source stripe: written by the webhook and the daily check only), or a club's year paid by
-- transfer (source invoice: written when its invoice is marked paid)
CREATE TABLE subscriptions (
  subject        TEXT PRIMARY KEY,
  plan           TEXT NOT NULL,
  status         TEXT NOT NULL,                    -- active | past_due | canceled | incomplete | unpaid
  period         TEXT NOT NULL DEFAULT 'year',
  current_start  TEXT,
  current_end    TEXT,
  cancel_at_end  INTEGER NOT NULL DEFAULT 0,
  stripe_sub     TEXT,
  price_id       TEXT NOT NULL DEFAULT '',
  amount         INTEGER NOT NULL DEFAULT 0,       -- cents
  currency       TEXT NOT NULL DEFAULT 'eur',
  first_paid_at  TEXT,
  renew_notice   TEXT,                             -- the period end the yearly notice was sent for
  ended_at       TEXT,
  source         TEXT NOT NULL DEFAULT 'stripe',   -- stripe | invoice
  invoice_id     INTEGER,
  updated_at     TEXT NOT NULL
);
CREATE INDEX subscriptions_status ON subscriptions (status, current_end);
CREATE UNIQUE INDEX subscriptions_stripe ON subscriptions (stripe_sub) WHERE stripe_sub IS NOT NULL;

-- access not carried by a subscription
CREATE TABLE grants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  subject     TEXT NOT NULL,
  plan        TEXT NOT NULL,                       -- plus | club | fed-clubs | fed-all
  until       TEXT,                                -- YYYY-MM-DD, its last day; NULL: no end
  reason      TEXT NOT NULL,                       -- trial | founder | gift | staff | agreement | event | trust | pilot
  note        TEXT NOT NULL DEFAULT '',
  by_user     INTEGER,
  created_at  TEXT NOT NULL,
  ended_at    TEXT
);
CREATE INDEX grants_subject ON grants (subject, ended_at);

-- every Stripe event seen: applied once, failures listed to the administrators (ids only, nothing personal)
CREATE TABLE billing_events (
  event_id    TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  at          TEXT NOT NULL,
  ok          INTEGER NOT NULL DEFAULT 0,
  note        TEXT NOT NULL DEFAULT '',
  ref         TEXT NOT NULL DEFAULT ''             -- the object's id (a subscription, an invoice, a charge)
);
CREATE INDEX billing_events_at ON billing_events (at);

CREATE TABLE usage_counters (
  subject     TEXT NOT NULL,
  k           TEXT NOT NULL,                       -- genKm2
  period      TEXT NOT NULL,                       -- YYYY-MM
  n           REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, k, period)
);
CREATE TABLE usage_credits (
  subject     TEXT NOT NULL,
  k           TEXT NOT NULL,
  n           REAL NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (subject, k)
);

-- codes (founders, gifts, pilots): only the code's SHA-256 kept
CREATE TABLE billing_codes (
  code_hash   TEXT PRIMARY KEY,
  plan        TEXT NOT NULL,
  days        INTEGER NOT NULL,
  max_uses    INTEGER NOT NULL DEFAULT 1,
  uses        INTEGER NOT NULL DEFAULT 0,
  expires     TEXT,
  reason      TEXT NOT NULL DEFAULT 'gift',
  note        TEXT NOT NULL DEFAULT '',
  by_user     INTEGER,
  created_at  TEXT NOT NULL,
  ended_at    TEXT
);
CREATE TABLE billing_code_uses (
  code_hash   TEXT NOT NULL,
  subject     TEXT NOT NULL,
  at          TEXT NOT NULL,
  PRIMARY KEY (code_hash, subject)
);

-- a club as a customer: what its invoices print
CREATE TABLE org_billing (
  org_id      INTEGER PRIMARY KEY,
  name        TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL DEFAULT '',
  country     TEXT NOT NULL DEFAULT '',
  siret       TEXT NOT NULL DEFAULT '',
  vat_id      TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  updated_at  TEXT NOT NULL,
  updated_by  INTEGER
);

-- Ozimut's own invoices (clubs, leagues, federations): issued ones are never modified; a correction is a credit note
CREATE TABLE invoices (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  number      TEXT,                                -- « OZ-2027-0001 » (invoices and credit notes share the series); NULL a draft or a quote
  kind        TEXT NOT NULL DEFAULT 'invoice',     -- invoice | credit | quote
  subject     TEXT NOT NULL,
  org_id      INTEGER,
  lines       TEXT NOT NULL DEFAULT '[]',          -- JSON [{ label, qty, unit (cents), amount (cents), k }]
  net         INTEGER NOT NULL DEFAULT 0,
  vat         INTEGER NOT NULL DEFAULT 0,
  total       INTEGER NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'eur',
  status      TEXT NOT NULL DEFAULT 'draft',       -- draft | issued | paid | cancelled
  issued_at   TEXT,
  due_at      TEXT,
  paid_at     TEXT,
  paid_how    TEXT NOT NULL DEFAULT '',
  of_invoice  INTEGER,                             -- a credit note's invoice
  plan        TEXT NOT NULL DEFAULT '',            -- what paying it opens (club, fed-clubs, fed-all), '' nothing
  period_from TEXT,
  period_to   TEXT,
  seller      TEXT NOT NULL DEFAULT '{}',          -- JSON, as it was when issued
  buyer       TEXT NOT NULL DEFAULT '{}',
  note        TEXT NOT NULL DEFAULT '',
  reminded    INTEGER NOT NULL DEFAULT 0,
  by_user     INTEGER,
  created_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX invoices_number ON invoices (number) WHERE number IS NOT NULL;
CREATE INDEX invoices_subject ON invoices (subject, status);
CREATE TABLE invoice_seq (
  year        INTEGER PRIMARY KEY,
  n           INTEGER NOT NULL
);

-- the funnel, counted without accounts (sheets shown, checkouts started, paid)
CREATE TABLE billing_funnel (
  day         TEXT NOT NULL,
  step        TEXT NOT NULL,                       -- sheet | trial | checkout | paid | cancel | pricing
  k           TEXT NOT NULL DEFAULT '',
  n           INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, step, k)
);

-- an e-mail sent once (the trial's end, a renewal, an invoice's reminder)
CREATE TABLE billing_notices (
  subject     TEXT NOT NULL,
  kind        TEXT NOT NULL,
  ref         TEXT NOT NULL DEFAULT '',
  at          TEXT NOT NULL,
  PRIMARY KEY (subject, kind, ref)
);
