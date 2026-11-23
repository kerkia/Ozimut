-- Entries, merged with start times (owner, 2026-11-22; docs/clubs/design.md « Entries »). An event's entry form (its rules,
-- prices, how start times are given), one row per runner entered, the amounts each payer owes and what was marked paid —
-- every payment made outside Ozimut. Replaces the start-time booking of migration 0023: its tables are no longer used (the
-- owner: never used for real, their rows may go); « Mes coureurs » (booking_runners) stays.
-- functions/_lib/entries.js, functions/api/entries/[[path]].js, functions/api/accounts/[[path]].js.

CREATE TABLE entry_forms (
  event_id     TEXT PRIMARY KEY,                   -- events.id
  state        TEXT NOT NULL DEFAULT 'draft',      -- draft (its team only) | open | closed
  opens        TEXT,                               -- "YYYY-MM-DDTHH:MM" Paris; NULL: as soon as open
  closes       TEXT,                               -- "YYYY-MM-DDTHH:MM" Paris
  late_until   TEXT,                               -- late entries until (Paris), at the late fee
  places       INTEGER,                            -- the event's places; NULL: no limit
  classes      TEXT NOT NULL DEFAULT '[]',         -- JSON [{ id, name, course, places?, cats?: ["H21",…], sex?, minAge?, maxAge? }]
  prices       TEXT NOT NULL DEFAULT '{}',         -- JSON rules (site/assets/js/entryprice.js)
  fields       TEXT NOT NULL DEFAULT '{}',         -- JSON { card: "no"|"ask"|"require", birth: bool, note: bool }
  starts       TEXT NOT NULL DEFAULT '{}',         -- JSON { mode: none|booking|draw|deposit, circuits, gap, max, blocked, note, seed }
  pay          TEXT NOT NULL DEFAULT '{}',         -- JSON { transfer: bool, desk: bool, before: "YYYY-MM-DD", note }
  refund_rule  TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  chrono_n     INTEGER NOT NULL DEFAULT 0,         -- the server station's last operation number in the event's Chrono log
  chrono_seen  TEXT NOT NULL DEFAULT '{}',         -- JSON { station: n } of the Chrono operations already read back
  changed_at   TEXT,                               -- the entries' last change
  published_at TEXT,                               -- the start list last published from them
  created_by   INTEGER NOT NULL,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX entry_forms_state ON entry_forms (state);

CREATE TABLE entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id     TEXT NOT NULL,
  person       TEXT NOT NULL,                      -- once per event: « L<licence> », else « N<name>|<club key> » (_lib/booking.js personOf)
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  licence      TEXT NOT NULL DEFAULT '',
  birth_year   INTEGER,
  sex          TEXT NOT NULL DEFAULT '',           -- F | M | ''
  category     TEXT NOT NULL DEFAULT '',
  club_country TEXT NOT NULL DEFAULT '',
  club_code    TEXT NOT NULL DEFAULT '',
  club_name    TEXT NOT NULL DEFAULT '',
  club_key     TEXT NOT NULL DEFAULT '',           -- « FR:0109 », « CH:ol zimmerberg »; '' none
  org_id       INTEGER,                            -- the runner's club as an org, when known
  runner_id    INTEGER,                            -- the « Mes coureurs » row it was made from
  user_id      INTEGER,                            -- the runner's own account (an adult, or a child account), when known
  by_user      INTEGER,                            -- the account that made it (a parent, an organiser); NULL a desk entry
  class_id     TEXT NOT NULL DEFAULT '',
  course       TEXT NOT NULL DEFAULT '',
  card         TEXT NOT NULL DEFAULT '',
  rent         INTEGER NOT NULL DEFAULT 0,         -- 1: a rented card
  options      TEXT NOT NULL DEFAULT '[]',         -- JSON [option ids]
  price        INTEGER NOT NULL DEFAULT 0,         -- cents, fixed when entered
  price_rule   TEXT NOT NULL DEFAULT '',           -- JSON: the parts that made it
  payer        TEXT NOT NULL DEFAULT 'runner',     -- runner | club
  payer_org    INTEGER,                            -- the club that carries it (payer club)
  payer_user   INTEGER,                            -- the account that owes it (payer runner)
  order_ref    TEXT NOT NULL DEFAULT '',           -- the payer's reference for this event, « OZ-7K3F »
  pay_state    TEXT NOT NULL DEFAULT 'due',        -- due | paid | waived
  paid_at      TEXT,
  paid_how     TEXT NOT NULL DEFAULT '',           -- transfer | cash | cheque | card | club | other
  paid_by      INTEGER,
  start_s      INTEGER,                            -- seconds of the race's day
  start_by     TEXT NOT NULL DEFAULT '',           -- booked | drawn | deposited | desk | hand
  state        TEXT NOT NULL DEFAULT 'entered',    -- pending (a new account's, until its e-mail is confirmed) | entered | cancelled | dns
  origin       TEXT NOT NULL DEFAULT 'form',       -- form | guest | file | hand | desk
  chrono_id    TEXT,                               -- the runner's id in the event's Chrono log
  note         TEXT NOT NULL DEFAULT '',
  reminded     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE UNIQUE INDEX entries_person ON entries (event_id, person) WHERE state != 'cancelled';
CREATE UNIQUE INDEX entries_slot ON entries (event_id, course, start_s) WHERE start_s IS NOT NULL AND state != 'cancelled';
CREATE INDEX entries_event ON entries (event_id, state);
CREATE INDEX entries_by ON entries (by_user);
CREATE INDEX entries_user ON entries (user_id);
CREATE INDEX entries_payer_org ON entries (payer_org);
CREATE INDEX entries_org ON entries (org_id);
CREATE INDEX entries_ref ON entries (order_ref);

-- the references: one per payer and event, unique across Ozimut
CREATE TABLE entry_refs (
  ref          TEXT PRIMARY KEY,                   -- « OZ-7K3F »
  event_id     TEXT NOT NULL,
  payer        TEXT NOT NULL,                      -- « u<user id> » | « o<org id> »
  created_at   TEXT NOT NULL,
  UNIQUE (event_id, payer)
);

-- a club's account with its members (owner's year-end bill): what the club advanced is read from entries (payer club); what a
-- member paid back, a bill sent, a correction are rows here
CREATE TABLE club_ledger (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id       INTEGER NOT NULL,
  person       TEXT NOT NULL,                      -- the member as entries name them (« L<licence> » or « N…|… »)
  user_id      INTEGER,
  kind         TEXT NOT NULL,                      -- repaid | bill | adjust
  amount       INTEGER NOT NULL,                   -- cents (a repayment positive)
  season       TEXT NOT NULL,                      -- "2027"
  ref          TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  at           TEXT NOT NULL,
  by_user      INTEGER
);
CREATE INDEX club_ledger_org ON club_ledger (org_id, season);
CREATE INDEX club_ledger_person ON club_ledger (org_id, person);
