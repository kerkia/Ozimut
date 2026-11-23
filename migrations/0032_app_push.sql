-- The Ozimut app's notifications (docs/app/design.md « Native notifications »; owner, 2026-11-23): the companion app on a
-- phone receives every notification of the account natively (Firebase Cloud Messaging on Android, Apple Push Notification
-- service on an iPhone). One row a phone: the token its shell got from the system, sent by the page with its session
-- (POST /api/push/native); deleted when the phone turns them off, signs out, or the service says the token is gone.
CREATE TABLE IF NOT EXISTS app_push (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,              -- 'fcm' | 'apns'
  token TEXT NOT NULL UNIQUE,
  env TEXT NOT NULL DEFAULT 'prod',-- 'prod' | 'dev' (APNs' sandbox for debug builds)
  label TEXT,
  created_at INTEGER NOT NULL,
  last_ok INTEGER
);
CREATE INDEX IF NOT EXISTS app_push_user ON app_push (user_id);
