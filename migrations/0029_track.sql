-- Live GPS tracking and « Mes traces » (2026-11-21; docs/track/design.md). A child account is a users row managed by its
-- parents (track_guardians), with no password of its own; every device (the Ozimut app on a phone, a watch app) is signed in
-- to one account (track_devices); watchers are accounts allowed to follow another live (track_watchers); a run is one
-- recording (track_runs), its fixes kept in R2 (track/<user>/<run>…), never here.

ALTER TABLE users ADD COLUMN birth_year INTEGER;                            -- declared; NULL unknown
ALTER TABLE users ADD COLUMN child INTEGER NOT NULL DEFAULT 0;              -- 1: managed by its parents
ALTER TABLE users ADD COLUMN guardian_wanted INTEGER NOT NULL DEFAULT 0;    -- 1: an under-15's own account waiting for a parent

CREATE TABLE IF NOT EXISTS track_guardians (
  child_id   INTEGER NOT NULL,
  parent_id  INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (child_id, parent_id)
);
CREATE INDEX IF NOT EXISTS track_guardians_parent ON track_guardians (parent_id);

CREATE TABLE IF NOT EXISTS track_watchers (
  user_id    INTEGER NOT NULL,                  -- the account followed
  watcher_id INTEGER NOT NULL,
  granted_by INTEGER NOT NULL,
  alerts     TEXT,                              -- JSON: the alerts this watcher wants (null: the defaults)
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, watcher_id)
);
CREATE INDEX IF NOT EXISTS track_watchers_watcher ON track_watchers (watcher_id);

CREATE TABLE IF NOT EXISTS track_devices (
  id          TEXT PRIMARY KEY,                 -- d_<10 base36>
  user_id     INTEGER,                          -- NULL: a watch's claim not yet taken
  kind        TEXT NOT NULL,                    -- phone | applewatch | garmin | osmand
  label       TEXT,
  key_hash    TEXT NOT NULL UNIQUE,             -- sha256 of the device's key
  platform    TEXT,
  model       TEXT,
  app_version TEXT,
  claim       TEXT,                             -- a watch's 6-character code while unpaired
  push_kind   TEXT,                             -- fcm | apns
  push_token  TEXT,
  push_env    TEXT,
  test_ok     TEXT,                             -- the last self-test passed (ISO time)
  battery     INTEGER,
  last_seen   TEXT,
  created_at  TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE INDEX IF NOT EXISTS track_devices_user ON track_devices (user_id);
CREATE INDEX IF NOT EXISTS track_devices_claim ON track_devices (claim);

CREATE TABLE IF NOT EXISTS track_codes (
  code_hash  TEXT PRIMARY KEY,                  -- sha256 of the code
  kind       TEXT NOT NULL,                     -- pair | watch | guardian | attach | web
  user_id    INTEGER NOT NULL,                  -- the account it is about
  created_by INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,                  -- ms since epoch
  used       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS track_runs (
  id         TEXT PRIMARY KEY,                  -- r_<UTC start>_<4 base36>, made by the device; or i_<…> for an import
  user_id    INTEGER NOT NULL,
  device_id  TEXT,
  source     TEXT NOT NULL,                     -- phone | applewatch | garmin | osmand | file | health | polar
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  last_at    TEXT,                              -- the last batch received
  state      TEXT NOT NULL,                     -- run | help | end
  share      TEXT NOT NULL,                     -- watchers | private
  last_seq   INTEGER NOT NULL DEFAULT 0,
  fixes      INTEGER NOT NULL DEFAULT 0,
  distance   REAL NOT NULL DEFAULT 0,           -- metres
  name       TEXT,
  kept       INTEGER NOT NULL DEFAULT 0,        -- 1: taken into an analysis or Mes cartes: not deleted after 30 days
  summary    TEXT,                              -- JSON: start lat/lon, place, worst gap…
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS track_runs_user ON track_runs (user_id, started_at);

CREATE TABLE IF NOT EXISTS track_settings (
  user_id      INTEGER PRIMARY KEY,
  batch        INTEGER NOT NULL DEFAULT 30,     -- seconds between batches while watched (10-60)
  cap          INTEGER NOT NULL DEFAULT 9000,   -- a run's longest duration, seconds
  call         TEXT,                            -- the number a child's help screen offers
  only_tracker INTEGER NOT NULL DEFAULT 0,      -- « Mode suivi seul »
  area         TEXT                             -- JSON { lat, lon, r } for the « out of the area » alert
);

CREATE TABLE IF NOT EXISTS track_polar (
  user_id    INTEGER PRIMARY KEY,
  polar_user TEXT NOT NULL,
  token      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS track_polar_user ON track_polar (polar_user);
