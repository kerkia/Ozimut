-- Clubs as entities (owner, 2026-11-22: « the club as an entity is needed today anyway — who in a club may create an event, be
-- part of an orga by default, see and manage maps »; docs/clubs/design.md). An org is a club, a committee, a league or a
-- federation; its members hold roles; its settings say who may organise, its entries' payment policy, its bank details, the
-- clubs it nets with. functions/_lib/orgs.js, functions/api/orgs/[[path]].js, the page « Mon club » (#/monclub).

CREATE TABLE orgs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  cc          TEXT NOT NULL,                       -- its country (ISO alpha-2)
  kind        TEXT NOT NULL DEFAULT 'club',        -- club | committee | league | federation
  code        TEXT NOT NULL DEFAULT '',            -- France: the directory's key (a club « 0109 », a league « AR », a committee « 69 »); '' none
  name        TEXT NOT NULL,
  parent      INTEGER,                             -- the committee or league above it, when known
  state       TEXT NOT NULL DEFAULT 'unclaimed',   -- unclaimed | claimed
  source      TEXT NOT NULL DEFAULT 'directory',   -- directory (France's federation tree) | declared (a member named it)
  created_at  TEXT NOT NULL,
  claimed_at  TEXT
);
CREATE UNIQUE INDEX orgs_code ON orgs (cc, kind, code) WHERE code != '';
CREATE INDEX orgs_name ON orgs (cc, name);

-- who belongs and what they may do; « member » is implied by a row in state ok
CREATE TABLE org_members (
  org_id      INTEGER NOT NULL,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roles       TEXT NOT NULL DEFAULT '',            -- comma-separated: manager, organiser, mapper, treasurer
  source      TEXT NOT NULL DEFAULT 'federation',  -- federation (the licence's club) | declared | invited | claim
  state       TEXT NOT NULL DEFAULT 'ok',          -- ok | pending (a declared membership or a claim waiting)
  until       TEXT,                                -- a guest's last day (YYYY-MM-DD); NULL: no end
  since       TEXT NOT NULL,
  added_by    INTEGER,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX org_members_user ON org_members (user_id);

-- the club's settings as JSON (docs/clubs/design.md « Settings »): events_by, default_team, entry_policy, iban, holder, contact
CREATE TABLE org_settings (
  org_id      INTEGER PRIMARY KEY,
  json        TEXT NOT NULL DEFAULT '{}',
  updated_at  TEXT NOT NULL,
  updated_by  INTEGER
);

-- invitation links for guests (a parent of another club, a controller): the token kept hashed, as the Tracer's
CREATE TABLE org_invites (
  token_hash  TEXT PRIMARY KEY,
  org_id      INTEGER NOT NULL,
  roles       TEXT NOT NULL DEFAULT '',
  until       TEXT,                                -- the guest's last day once joined
  expires_at  TEXT NOT NULL,                       -- the link's own end
  created_by  INTEGER NOT NULL,
  created_at  TEXT NOT NULL,
  uses        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX org_invites_org ON org_invites (org_id);

-- netting between clubs (owner, 2026-11-22: « each club explicitly selects which clubs it accepts netting with; when two
-- clubs have accepted each other, both see the amounts in both directions and the net »): one row per acceptance
CREATE TABLE org_netting (
  org_id      INTEGER NOT NULL,
  other_id    INTEGER NOT NULL,
  since       TEXT NOT NULL,
  by_user     INTEGER,
  PRIMARY KEY (org_id, other_id)
);

-- the club's map library (docs/clubs/design.md « Maps »): the card in D1, the files in R2 orgmaps/<org>/<map>/
CREATE TABLE org_maps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  org_id      INTEGER NOT NULL,
  name        TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT '',
  region      TEXT NOT NULL DEFAULT '',
  dept        TEXT NOT NULL DEFAULT '',
  lat         REAL,
  lon         REAL,
  scale       INTEGER,                             -- 10000, 4000…
  standard    TEXT NOT NULL DEFAULT '',            -- ISOM2017-2, ISSprOM2019-2…
  surveyed    TEXT NOT NULL DEFAULT '',            -- year
  revised     TEXT NOT NULL DEFAULT '',            -- year
  mappers     TEXT NOT NULL DEFAULT '',
  area_km2    REAL,
  state       TEXT NOT NULL DEFAULT 'current',     -- current | revising | outdated
  carto_id    TEXT,                                -- a Cartographier document linked (not copied)
  version     INTEGER NOT NULL DEFAULT 1,
  files       TEXT NOT NULL DEFAULT '[]',          -- JSON: the current version's files [{ name, key, size, type }]
  geo         TEXT,                                -- JSON georeference when known
  embargo_until TEXT,                              -- YYYY-MM-DD: closed to members until then
  embargo_note  TEXT NOT NULL DEFAULT '',
  embargo_ok    TEXT NOT NULL DEFAULT '[]',        -- JSON: event ids whose teams may use it meanwhile
  rights      TEXT NOT NULL DEFAULT '{}',          -- JSON: { tracer, analyses, pixel, thumb: { by, name, at } } uses allowed in writing
  access      TEXT NOT NULL DEFAULT '{}',          -- JSON: per-map overrides of the roles' defaults
  status      TEXT NOT NULL DEFAULT 'active',      -- active | removed
  created_by  INTEGER,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX org_maps_org ON org_maps (org_id, status);

CREATE TABLE org_map_versions (
  map_id      INTEGER NOT NULL,
  version     INTEGER NOT NULL,
  files       TEXT NOT NULL DEFAULT '[]',
  note        TEXT NOT NULL DEFAULT '',
  by_user     INTEGER,
  at          TEXT NOT NULL,
  PRIMARY KEY (map_id, version)
);

-- an event's club (its organising org, resolved from its club or its creator's membership)
ALTER TABLE events ADD COLUMN org_id INTEGER;
CREATE INDEX events_org ON events (org_id);
-- the day an account's federation membership was last checked (functions/_lib/orgs.js syncFederation)
ALTER TABLE users ADD COLUMN org_checked TEXT;
