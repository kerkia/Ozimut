-- « Mes cartes » shared with chosen accounts (owner, 2026-11-24: « a way for a user to share his library with others »; by
-- invitation links the same day, not by looking accounts up by name): the owner's whole library, read only, by each account
-- named here — it shows as a tab of its own beside « Ma bibliothèque » (functions/api/mymaps/[[path]].js /shares, /invites,
-- /u/<owner>). Its maps marked « Carte privée » stay private; the personal channels (heart rate…) are never served; traces 0
-- shares the maps without the routes run on them.
CREATE TABLE mymap_grants (
  owner_id   INTEGER NOT NULL,                 -- the library's account
  grantee_id INTEGER NOT NULL,                 -- the account it is shared with
  traces     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, grantee_id)
);
CREATE INDEX mymap_grants_grantee ON mymap_grants (grantee_id);
-- An invitation: a link the owner hands to one person, used once, valid 7 days; only its token's SHA-256 is kept.
CREATE TABLE mymap_invites (
  id         TEXT PRIMARY KEY,                 -- shown to the owner (to cancel it), never the token
  token_hash TEXT NOT NULL UNIQUE,
  owner_id   INTEGER NOT NULL,
  traces     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX mymap_invites_owner ON mymap_invites (owner_id);
