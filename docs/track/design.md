# Ozimut tracking — the contract

The live GPS tracking of runners without a watch and of children followed by their parents, the « Mes traces » list, and
the devices that feed them (the Ozimut app on Android and iPhone, the Wear OS app, the Apple Watch app; the Garmin data
field, set aside on 2026-11-23). Decided by
the owner on 2026-11-21 after the study `C:\Kerkia\Ozimut\work\study\gps-tracking\ozimut-gps-tracking-from-a-phone.pdf`
(second version). This file is the contract between the server (`functions/api/track`, `live/src/track.js`), the site's
pages and the native code (`track/android`, `track/ios`, `track/garmin`). Change it first, then the code.

**Since 2026-11-23 the native app is Folloz** (`docs/track/folloz.md`): a tracking app of its own, used without an account
(phones linked to each other by a code, through the relay's `TracChannel`), that can also send its runs to an Ozimut account
with this file's « Pairing a phone » and « Sending ». It holds no page of the site: « The site ↔ app bridge » below and the web
view's session describe the app of before 2026-11-23. The rules below are Ozimut's accounts'; Folloz's are in its own file.

## The rules

1. **A run always belongs to an account.** A device (phone app, watch app) is signed in to one account once, and stays so
   until the account (or a managing parent) removes it. Nothing is recorded anonymously.
2. **A child has an account of their own, managed by a parent.** No e-mail, no password; the parent creates it, pairs the
   child's devices, chooses its watchers. Under 15 nobody creates an account alone (registration rule below).
3. **Watchers are accounts.** A followed account keeps a list of accounts allowed to follow it live; a watcher signs in to
   watch. No secret link.
4. **One fix a second, always.** Only the sending changes.
5. **Batches.** Every `batch` seconds (30 by default, 10–60, the followed account's setting) while a watcher's page is
   open, every 120 s otherwise; at once for help, at the end, and when a network returns after a failure. The watch page
   replays the fixes on a clock `now − (batch + 10 s)`, second by second.
6. **Live and after are the same data**: the analyses' trace form (`site/assets/js/trace/share.js` `encodeTrace`), plus
   accuracy.
7. **One way in, one batch format** for every device; adapters in front of it (Traccar Client's OsmAnd protocol).

## Feature flag

`TRACK_OPEN` (wrangler.toml `[vars]`, "0" until the owner opens it): "0" → every tracking page, API and documentation chapter
is the administrators' (owner, 2026-11-22: « visible to admin only for now »), and the child accounts they create (a child's
phone pairs its own watch); "1" → every account, the registration form asks the year of birth, **and the under-15
registration rule applies**. The device endpoints (`pair`, `push`,
`osmand`, `claim`) work whatever the flag: a device only exists if an allowed account made it.

## Data (D1, migration `0029_track.sql`)

```sql
ALTER TABLE users ADD COLUMN birth_year INTEGER;          -- declared at registration (or for a child by the parent); NULL unknown
ALTER TABLE users ADD COLUMN child INTEGER NOT NULL DEFAULT 0;      -- 1: managed by parents (track_guardians)
ALTER TABLE users ADD COLUMN guardian_wanted INTEGER NOT NULL DEFAULT 0; -- 1: an under-15 own account waiting for a parent

CREATE TABLE track_guardians (child_id INTEGER NOT NULL, parent_id INTEGER NOT NULL, created_at TEXT NOT NULL,
  PRIMARY KEY (child_id, parent_id));
CREATE TABLE track_watchers (user_id INTEGER NOT NULL, watcher_id INTEGER NOT NULL, granted_by INTEGER NOT NULL,
  alerts TEXT, created_at TEXT NOT NULL, PRIMARY KEY (user_id, watcher_id));
CREATE TABLE track_devices (id TEXT PRIMARY KEY, user_id INTEGER, kind TEXT NOT NULL, label TEXT, key_hash TEXT NOT NULL,
  platform TEXT, model TEXT, app_version TEXT, claim TEXT, push_kind TEXT, push_token TEXT, test_ok TEXT,
  battery INTEGER, last_seen TEXT, created_at TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE track_codes (code_hash TEXT PRIMARY KEY, kind TEXT NOT NULL, user_id INTEGER NOT NULL, created_by INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);  -- kind: pair | watch | guardian | attach | web
CREATE TABLE track_runs (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, device_id TEXT, source TEXT NOT NULL,
  started_at TEXT NOT NULL, ended_at TEXT, state TEXT NOT NULL, share TEXT NOT NULL, last_seq INTEGER NOT NULL DEFAULT 0,
  fixes INTEGER NOT NULL DEFAULT 0, distance REAL NOT NULL DEFAULT 0, summary TEXT, created_at TEXT NOT NULL);
CREATE TABLE track_settings (user_id INTEGER PRIMARY KEY, batch INTEGER NOT NULL DEFAULT 30, cap INTEGER NOT NULL DEFAULT 9000,
  call TEXT, only_tracker INTEGER NOT NULL DEFAULT 0, area TEXT);
CREATE TABLE track_polar (user_id INTEGER PRIMARY KEY, polar_user TEXT NOT NULL, token TEXT NOT NULL, created_at TEXT NOT NULL);
```
A child account: `users` row with `email` = `child-<12 hex>@ozimut.invalid` (receives nothing, as the demo accounts'
`@ocn.invalid`), `pw_hash` '' (no login with a password), `email_verified` 1, `child` 1, `licence` the one given or ''.
R2 `cn-state`: `track/<user>/<run>/<seq>.json` (a batch as received, normalised), `track/<user>/<run>.json` (the whole run
in the trace form, written at the end and on read), kept 30 days unless taken into an analysis or Mes cartes.

## Device protocol

All JSON over HTTPS to `https://ozimut.com` (a dev build may set another base). Times are whole seconds since 1970 (UTC)
of the fix itself; coordinates millionths of a degree; in `dt`, `la`, `lo` and `al` the first value is absolute, the
others differences from the previous one; `ac` (accuracy, metres) is plain, each value its own fix's (2026-11-21: the Android
build first sent it as differences).

### Pairing a phone: `POST /api/track/pair`
A signed-in account makes a code for itself (a child's account too: its iPhone pairs its own Apple Watch so) or a child it
manages: `POST /api/track/pair-code { account }` →
`{ code: "K7QM4TXD", url: "https://ozimut.com/t/K7QM4TXD", expires: 900 }`; the page shows the url as a QR code, and inside
the app the site may hand the code to the native side directly (bridge `pair`).
```
POST /api/track/pair
{ "code": "K7QM4TXD",
  "device": { "kind": "phone", "platform": "android" | "ios", "version": "1.0.0", "os": "16", "model": "SM-A546B" } }
200 { "device": "d_<10 base36>", "key": "<48 base64url>",
      "account": { "id": 123, "name": "Léa", "child": true, "lang": "fr" },
      "watchers": ["Maman", "Papa"],
      "settings": { "fix": 1, "batch": 30, "idle": 120, "cap": 9000, "call": "+33…", "onlyTracker": false },
      "webToken": "<one-time, 5 min>" }
400 { error: "code" } (unknown, used or expired) · 429 { error: "too many" }
```
The device keeps `device`, `key` (Keychain / EncryptedSharedPreferences). Every later call: `Authorization: Bearer <key>`.

### The web view's session: `POST /api/track/webtoken` then `/t/login#<token>`
The app signs its web view in to the device's account (needed for a child, convenient for anyone): `POST /api/track/webtoken`
(Bearer key) → `{ token }` (one-time, 5 minutes); the web view loads `https://ozimut.com/t/login#<token>`, a page that
posts it to `POST /api/track/session { token }`, which sets the session cookie and redirects to `#/` (or `#/suivi/moi` for
a child in « suivi seul » mode). An adult who signed in in the web view first does not need it.

### Sending: `POST /api/track/push`
```
Authorization: Bearer <key>      Content-Type: application/json   (Content-Encoding: gzip accepted)
{ "v": 1,
  "run": "r_20261121T093512_ab12",        // made by the device at Start: UTC start time and 4 random base36
  "seq": 42,                              // 1, 2, 3… within the run
  "state": "run" | "end" | "help",
  "share": "watchers" | "private",
  "t0": 1795253712, "dt": [0,1,1], "la": [48412345,12,-3], "lo": [2634567,-20,-18],
  "ac": [5,5,6],                          // estimated accuracy, metres (integers)
  "al": [87,0,0],                         // optional, metres
  "bat": 71, "lp": false, "left": 0,
  "pace": { "mode": "long", "fix": 30, "send": 600, "remote": true, "boost": 0, "by": "" } }   // optional: Folloz's pace
200 { "ack": 42, "next": 30, "stop": false }
401 { error: "device" } — removed: the device stops, forgets its key, says so
409 { error: "closed" } · 413 (more than 600 fixes: split) · 429 { error: "slow", next }
```
- A batch number already held is ignored (`ack` = highest received without a gap); the device deletes acknowledged fixes
  and resends from the next.
- `next` = seconds before the next batch (the setting while watched, 120 otherwise). The device always sends at Stop,
  for help, and when a network returns.
- `stop: true` → the device ends the run (a parent ended it, or the device was removed).
- An empty batch (`dt: []`) is allowed: a heartbeat with `bat`.
- A run opens at its first batch, closes with `state: "end"`, the cap (`cap` seconds from its start) or 30 min of silence
  after the cap.
- `pace` (Folloz, 2026-11-25; `docs/track/folloz.md` « Pace »): a long run (`mode` "long") is kept up to 7 days whatever
  the account's cap, `next` is its `send` (15 while `boost` is ahead), `LiveTrack` calls it silent after 3 × `send` + 120 s
  and still after 30 min within 15 m, and the watch page replays `send` + 10 s behind. Ozimut's watchers cannot ask for
  Direct (Folloz's watchers can).

### Watches: claim codes (`kind` "wearos" | "applewatch" | "garmin")
A watch has no keyboard: it makes its own key (32 random base64url) and a claim code (6 letters/digits from
`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`), keeps both, shows the code while unpaired, and sends
`POST /api/track/claim { claim, key, kind, model, version }` → `202 { paired: false }` until an account claims it on the
site (« Famille » or « Mes appareils » › « Associer une montre », the code typed) → then `200 { paired: true, account, settings }`.
It asks again every 10 s while the code is shown. From then on it pushes as a phone does (`Bearer <key>`).
The Wear OS app (`track/android/wear`, 2026-11-23) pairs only so: a watch with LTE records and sends alone, with the phone
app's own tracker and queue.
An iPhone app may pair its own Apple Watch directly: it makes a pair code for its account, the watch posts
`/api/track/pair` with it (sent over WatchConnectivity).

### Traccar Client (phase 0 pilot): `GET|POST /api/track/osmand/<key>`
OsmAnd protocol (`id`, `timestamp`, `lat`, `lon`, `accuracy`, `altitude`, `speed`, `bearing`, `batt`); one fix a request;
a device of kind "osmand" made by « Famille et appareils › <person> › Traccar Client » (its QR code configures the app when
read by **Traccar Client's own scanner** — its settings, the QR icon at the top —:
`https://ozimut.com/api/track/osmand/<key>?id=<device>&interval=5&distance=0&accuracy=highest&buffer=true&wakelock=true&stop_detection=false`;
the client keeps the origin and path as its server address and reads the query as its settings, the names and values as
traccar-client's `configuration_service.dart` reads them: `accuracy` in lower case, `stop_detection` in snake case). The same
settings as a deep link, `org.traccar.client://config?url=<server>&id=…` (an `intent://` on Android), open the app from a page
on the phone. **A browser opening the address** (the QR code read by the phone's camera; `GET`, no `lat`, `Accept: text/html`)
gets a page instead of « OK » (`functions/_lib/traccarpage.js`, four languages): the deep link's button, how to scan from the
app, the server address to copy with the accuracy and interval to set by hand, the stores.
A run opens at the first fix and closes after 10 minutes of silence.

### Native push tokens: `POST /api/track/pushtoken`
`(Bearer key) { kind: "fcm" | "apns", token, env: "prod" | "dev" }` → the device receives the account's notifications
(tracking alerts, and every other notification the site sends to the account) natively. Sent by
`functions/_lib/push.js` beside Web Push when the secrets exist (FCM: `FCM_SERVICE_ACCOUNT`; APNs: `APNS_KEY`, `APNS_KEY_ID`,
`APNS_TEAM_ID`, `APNS_TOPIC`); without them the device gets none. Payload: `{ title, body, url }` (url = a site address,
opened in the app's web view).

## Watch pages: `/ws/track/<user id>`
A watcher's (or managing parent's, or the account's own) session; the live object `LiveTrack` (live relay, one per
followed account, `idFromName("u<id>")`). Messages to the page:
`{ t: "hello", run, name, batch, fixes: <trace form of the run so far>, bat, lp, last }`,
`{ t: "fixes", run, seq, t0, dt, la, lo, ac, bat, lp, at }`, `{ t: "state", run, state, at }` (end, help, stop),
`{ t: "alert", kind, at, ... }`. The page asks nothing over it.

## Alerts
Computed by `LiveTrack` (an alarm every 30 s during a run): `start`, `end`, `help` (always), `silent` (no batch for 3 min),
`still` (within 15 m for 5 min), `battery` (< 15 %, once), `back` (within 50 m of the start after 10 min away), `area`
(beyond `track_settings.area` {lat, lon, r}). Sent to the Pages function `POST /api/track/alert` with the header
`X-Relay: <TRACK_RELAY_SECRET>` (a secret shared by both workers), which notifies each watcher by their push devices.

## The site ↔ app bridge
The app's web view loads the live site; its user agent ends with ` OzimutApp/<version> (<android|ios>)`. The native side
exposes one entry point, and the site's `site/assets/js/appbridge.js` wraps it:
- Android: `window.OzimutNative.call(id, name, argsJson)` (a `@JavascriptInterface`); answers by evaluating
  `window.__ozApp.resolve(id, resultJson)` (or `.reject(id, message)`).
- iOS: `window.webkit.messageHandlers.ozimut.postMessage({ id, name, args })`; answers the same way.
- Native → site events: `window.__ozApp.event({ type, ... })`, dispatched as `CustomEvent("ozimut-app", { detail })`.

Calls (each answers a JSON value):
| name | args | answer |
|---|---|---|
| `info` | – | `{ platform, version, features: ["tracker","health","push","files","watch"], paired: { device, account, name } \| null }` |
| `pair` | `{ code }` | the device's pairing as `info.paired`; the native side calls `/api/track/pair` itself |
| `unpair` | – | `true` |
| `openTracker` | – | opens the native Start screen |
| `trackerState` | – | `{ state: "ready"\|"running"\|"ending"\|"none", run, since, fixes, pending }` |
| `selfTest` | – | opens the two-minute test |
| `pushRegister` | – | asks the notification permission and sends the token; `{ ok }` |
| `healthRoutes` | `{ days }` | `[{ id, start, end, distance, source }]` (iOS: HealthKit workouts with a route) |
| `healthRoute` | `{ id }` | `{ name, gpx }` (a GPX text of that workout's route) |
| `openSettings` | `{ which: "battery"\|"app" }` | opens the system's settings (Android makers' battery screens) |
Events: `{ type: "file", name, mime, data: <base64> }` — a file opened with / shared to the app (GPX, FIT, TCX, KMZ, images,
PDF): the site takes it as « Analyse solo »'s inbox does; `{ type: "tracker", state, run }`; `{ type: "push", url }`.

## The native apps
- Identifiers: Android `com.ozimut.app`; iOS `com.ozimut.app`, watch app `com.ozimut.app.watchkitapp`; URL scheme
  `ozimut`; links `https://ozimut.com/t/*` (App Links `/.well-known/assetlinks.json`, Universal Links
  `/.well-known/apple-app-site-association`).
- `https://ozimut.com/t/<code>` (8 characters): a pair code. In the app it pairs; in a browser the page says what it is and
  links the stores.
- The tracker: one fix a second, a queue on disk (SQLite / Room or GRDB-free plain SQLite), batches per `next`, Stop held two
  seconds, Help, the cap, the two-minute self-test, recovery after the system ends the app, no location outside a run.
- Texts in French, English, German and Spanish (the site's rule), the language from the account (`account.lang`), else the
  system's.
- Builds: GitHub Actions `.github/workflows/track-android.yml`, `track-ios.yml`, `track-garmin.yml`, on a push touching
  `track/**` (any branch) and by hand. Unsigned builds unless the signing secrets exist.

## The registration rule (with `TRACK_OPEN` "1")
The form asks the year of birth (`birthYear`). Under 15 (this year − year of birth < 15): `422 { error: "under15" }` and
the page says « Demande à un parent de créer ton compte ». Existing accounts with a `birth_year` under 15 and no guardian:
`guardian_wanted` 1, no live sharing, no alerts, no heart rate kept, and a banner « Associe un parent à ton compte » (an
`attach` code the child sends; the parent opens it signed in and becomes guardian; the account becomes `child` with its
password kept). From 15 a child account may take itself over: `POST /api/track/takeover { email, password }` (the child's
session) → a verification e-mail; once confirmed, `child` 0, the guardians stay watchers.

## Polar
`POLAR_CLIENT_ID` / `POLAR_CLIENT_SECRET` (Pages secrets; without them the link is not offered). « Mes traces › Relier
Polar »: OAuth (`/api/track/polar/connect` → Polar → `/api/track/polar/callback`), the user registered with AccessLink,
the webhook `/api/track/polar/webhook` (signature `Polar-Webhook-Signature`, HMAC-SHA256 of the body with the webhook's
secret `POLAR_WEBHOOK_SECRET`) → the exercise's GPX fetched → a run of source « polar » in Mes traces.
