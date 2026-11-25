# Ozitrac — the contract

Decided by the owner on 2026-11-23, after the study of paid plans (`C:\Kerkia\Ozimut\work\study\payments`, the session
« Ozimut subscription and club payments study »): **the tracking app is a product of its own, named Ozitrac**, that anyone uses
without an Ozimut account — live tracking between phones, and every run kept as GPX — and that can also send its runs to an
Ozimut account, permanently tied to it (oneself or a child), as Traccar Client does. Ozimut's features (the history of runs,
the analyses, the maps) are Ozimut's: used on the site, in a browser, never inside the app. **The app sells nothing and shows
no price, no « subscribe » and no link to buying** (Apple 3.1.3, Google Play's payments policy); it holds no web page of Ozimut.

This file is the contract between the relay (`live/src/ozitrac.js`, Durable Object `TracChannel`), the site's Functions
(`functions/api/ozitrac/[[path]].js`, `functions/z/[[path]].js`) and the apps (`track/android/app` = Ozitrac for Android,
`track/android/wear` = Ozitrac for Wear OS, `track/ios` = Ozitrac for iPhone and Apple Watch).
Change it first, then the code. What `docs/track/design.md` says of Ozimut's own tracking (accounts, watchers, the watch page,
Mes traces) stays true for Ozimut's accounts; Ozitrac's link to Ozimut is that file's « Pairing a phone » and « Sending ».

## The rules

1. **No Ozitrac account.** A phone that is followed (the « watchee ») makes a **channel** on the relay; the phones that follow it
   (the « watchers ») join that channel by scanning its code. The relay knows channels and watchers by random numbers only.
2. **The relay cannot read a position.** Each watcher gets a key of its own at pairing (made by the watchee's phone, carried
   by the code, never sent to the relay); the watchee's phone encrypts every batch for each watcher with that watcher's key
   (AES-256-GCM). The relay sees sealed batches, their numbers and times, the alerts' kinds, the battery level.
3. **Nothing kept that is not needed.** The relay keeps the run under way (so that a watcher opening the app mid-run sees the
   trail so far), deleted 24 h after its end or when the next run starts; a channel nobody used for 180 days is deleted.
   Every run is kept as a file on the watchee's phone, exported as GPX when the runner wants.
4. **The watchee chooses who follows.** A code serves once and lasts 24 h; the watchee's phone lists its watchers (their names,
   sealed with their own key, so the relay cannot read them either) and removes any of them.
5. **Alerts** reach the watchers' phones by notification: start, end and silence (no batch for 3 minutes during a run, longer
   in long mode: « Pace ») seen by the relay; help, low battery (< 15 %), standing still (under 15 m in 5 minutes, 30 in long
   mode) and out of the zone seen by the watchee's phone, which sends their kind in clear.
6. **Two paces, chosen at the start** (owner, 2026-11-25: ultra-trails and raids last up to a few days). **Direct** (the default):
   one fix a second, as Ozimut's tracking; batches every 15 s while a watcher looks at the person, every 120 s otherwise (the
   relay says which). **Course longue**: one fix every 15, 30 or 60 s, batches every 5, 10 or 15 minutes, the phone saving its
   battery (below « Pace »). Either way batches go at once for help, at the end, and when a network returns.
6b. **A watcher may ask for Direct for a while** (owner, the same day: « the tracker remotely controlled by the watcher »): in a
   long run whose runner allowed it, any watcher asks for Direct for 5 to 60 minutes, or for the long pace again; the runner's
   phone obeys within seconds when it can be woken, else at its next batch, and refuses when its battery is low. The runner
   sees who asked; the runner's choice at the start and the battery always come first.
7. **Ozimut is optional and permanent.** « Relier à Ozimut » takes a pair code made on ozimut.com (Suivi GPS › Famille et
   appareils › the person › « Associer un téléphone »): from then on the phone also sends every run to that account, with
   Ozimut's protocol, until the account removes the device. Ozimut's own watchers (accounts) then follow on the site.

## Numbers and secrets

| Name | What | Form |
|---|---|---|
| `c` | a channel | 16 characters `a-z2-7` (80 random bits) |
| `cs` | the channel's secret, held by the watchee's phone alone | 43 characters base64url (256 bits); the relay keeps its SHA-256 |
| `w` | a watcher in a channel | 8 characters `a-z2-7` |
| `ws` | a watcher's secret, held by that watcher's phone | 43 characters base64url; the relay keeps its SHA-256 |
| `k` | a watcher's key, made by the watchee's phone for each code | 32 random bytes, base64url (43 characters); never sent to the relay |
| `i` | a code's token, made by the watchee's phone | 16 characters `a-z2-7`; the relay keeps its SHA-256 for 24 h |

## The code a watcher scans: `https://ozimut.com/z/<c>#<i>.<k>.<name>`

`<name>` is the watchee's first name as typed on their phone, UTF-8 then base64url. Everything after `#` stays on the phones
(a browser never sends it). The QR code holds this address; it can also be sent as a link. Ozitrac opens it (Android App Link
on `https://ozimut.com/z/`, iPhone universal link); a browser without the app shows `functions/z/[[path]].js`'s page: what
Ozitrac is and where to get it (no data of the channel is read).

## The relay's API, under `https://ozimut.com/api/ozitrac`

Every body is JSON. A secret goes as `Authorization: Bearer <secret>`. Errors: 400 `bad request`, 401 `secret`, 404 `channel`
(gone or unknown), 409 `code` (a code used, expired or unknown), 413 `too large`, 429 `too many`.

| Route | Who | Body → answer |
|---|---|---|
| `GET /config` | anyone | → `{ tiles, attribution, maxZoom, watched, idle, layers, areas, elsewhere }`: the map's layers and where each is offered (below « The map »), the batch intervals in seconds; `tiles`, `attribution`, `maxZoom` the default layer elsewhere, for an app that reads no layers |
| `POST /channel` | anyone (20 an hour an address) | `{}` → 201 `{ c, cs }` |
| `GET /<c>` | watchee (`cs`) | → `{ watchers: [{ w, name, since, seen }], run }`; `name` sealed (below), `since`/`seen` ISO times |
| `POST /<c>/invite` | watchee | `{ i }` → `{ exp }` (10 codes open at most) |
| `POST /<c>/join` | anyone holding a code (40 an hour an address) | `{ i, name, push? }` → `{ w, ws }`; `name` sealed with `k`; 20 watchers at most |
| `POST /<c>/push` | watchee | a batch (below) → `{ ack, next, watched, boost }` |
| `PUT /<c>/token` | watchee | its own push token, `{ kind: "fcm" \| "apns", token, env? }`, or `{}` to drop it: how a watcher's request for Direct wakes it (« Pace ») |
| `GET /<c>/w/<w>?run=&since=` | that watcher (`ws`) | → `{ run, state, started, last, bat, pace, boost, alerts, blobs: [[seq, sealed]], next }`; the blobs after `since` of run `run`, else every blob of the run under way |
| `PUT /<c>/w/<w>/push` | that watcher | `{ kind: "fcm" \| "apns", token, env? }`, or `{}` to drop it |
| `POST /<c>/w/<w>/pace` | that watcher | `{ min }` (1-60: Direct for that many minutes; 0: the long pace again) → `{ boost }`; 409 `pace` when no long run allowing it is under way, 429 within 15 s of this watcher's last request |
| `DELETE /<c>/w/<w>` | the watchee, or that watcher | → `{ ok }` (the watcher and its blobs go) |
| `DELETE /<c>` | watchee | → `{ ok }` (everything goes) |

**A batch**: `{ v: 1, run, seq, state: "run" | "help" | "end", sealed: { <w>: <sealed> }, alerts: ["battery" | "still" | "zone"],
bat, lp }` — `run` the phone's run id (`r_YYYYMMDDTHHMMSS_xxxx`, as Ozimut's), `seq` from 1, a number already held answered `ack`
without storing; a new `run` starts the run (the former's blobs dropped, alert « start »); `help` and `end` alert; `bat` the
battery %, `lp` low-power mode. 512 KB at most. `next`: `watched` seconds (15) when a watcher asked for the person in the last
45 s, else `idle` (120); in a long run its `send`, or 15 while a watcher's request for Direct holds.
`pace` (since 2026-11-25; a batch without it is Direct): the pace the phone is keeping, `{ mode: "live" | "long", fix, send,
remote, boost, by }` — `fix` seconds between fixes, `send` seconds between batches (the long pace's, Direct's figures being 1
and 15/120), `remote` true when watchers may ask for Direct, `boost` the Unix second the Direct asked for ends (0: none), `by`
the watcher who asked (`w`, or ""). The relay keeps the latest; the answer's `boost` is the relay's last request,
`{ until, at, by }` or null (below).

## Pace

**Direct** is rule 6's one fix a second. **Course longue** (a long run): chosen at the start with `fix` 15, 30 or 60 s (30 by
default) and `send` 300, 600 or 900 s (600), and whether watchers may ask for Direct (yes by default). The phone saves its
battery: no fix in between (the location system asked for that interval, its fixes batched by the system where it can, the
processor left asleep between batches), a lower accuracy request where the platform allows (10 m), batches every `send`
seconds, at once for help, the end and a network back. A long run lasts 7 days at most (Direct: 6 hours without Ozimut, the
account's cap with it). Standing still is « under 15 m in 30 minutes ». The relay calls a long run silent after
3 × `send` + 120 s without a batch (32 min at 10 min) and gives it up after 36 h (Direct: 3 min and 6 h).

**A watcher's request** (`POST /<c>/w/<w>/pace { min }`): accepted while a long run with `remote` is under way; the relay keeps
`boost = { until: now + min × 60, at: now, by: w }` (`min` 0: `until` = now, the request to go back) and asks Ozimut's Function
to wake the runner's phone with a data notification to its token (`PUT /<c>/token`): `{ app: "ozitrac", c, kind: "pace",
until, at, by }` (FCM high priority; APNs a background notification, `content-available`, priority 5 — it may come late; the
next batch's answer carries it anyway). The phone applies a request whose `at` it has not applied yet: Direct (one fix a
second, batches every 15 s) until `until`, then the long pace again; it refuses (keeps the long pace, its `pace.boost` 0)
when `remote` is off or its battery is under 20 %, and shows in its running notification who asked and until when (the name
it holds for `by`). Its next batch, sent within 15 s when it applied a request, reports the pace kept, which every watcher
reads (`pace`, `boost` in a watcher's read). A run's `boost` goes with the run.

**Sealed** = base64url( 12-byte random IV ‖ AES-256-GCM ciphertext and its 16-byte tag ), the key `k`, the additional data the
UTF-8 bytes of `<c>|<w>|<run>|<seq>`; a watcher's name, sealed before the relay gives it its `w`, with `<c>|name`. The plaintext of a batch is Ozimut's batch
form: `{ "t0": <first fix's Unix seconds>, "dt": [...], "la": [...], "lo": [...], "ac": [...], "al": [...]? }` — `la`, `lo` in
millionths of a degree, `dt`, `la`, `lo`, `al` the first value absolute then differences, `ac` plain (metres).

**The watcher's alerts** (`alerts` in its answer and in notifications): `{ kind, t }` with `kind` among `start`, `end`, `help`,
`silent`, `battery`, `still`, `zone`, `t` Unix seconds; the run's alerts are kept with it.

**Notifications** (Firebase Cloud Messaging to Android, data only, high priority for `help`, `silent`, `zone`; APNs to the iPhone):
`{ app: "ozitrac", c, kind, t, run }`. The watcher's app shows them with the name it holds for `c` (« Tom a besoin d'aide »).
Sent by the site's Function when a batch brings them, by the relay's alarm (`POST <SITE_URL>/api/ozitrac/alert`, header
`X-Relay: <TRACK_RELAY_SECRET>`) for `silent`. A token Firebase or APNs calls gone is dropped. The runner's own phone gets
one kind only, `pace` (« Pace »), never shown as a notification of its own. To the iPhone the same data
goes beside an alert whose `loc-key` is `OZ_ALERT_<KIND>` (the sentence without a name, in the app's languages) and
`mutable-content: 1`; the app's notification extension then writes the name it holds for `c`, which the app shares with it
through its App Group (`group.com.ozimut.ozitrac`, the names alone). The relay knows no name, so it can send none.

## The apps

**One app, two roles on the same phone.** « Ma course » (being followed): Start — « Direct » or « Course longue » with its two
intervals and « Mes suiveurs peuvent passer en direct » —, Help and Stop held two seconds, the two-minute
test, « Qui me suit » (the watchers by name, add with a code, remove), « Mes courses » (each run: GPX shared or saved,
deleted), the zone (a centre and a radius, set on this phone), « Relier à Ozimut ». « Je suis » (following): the people
followed, each with their state (running, last position's age, battery, the pace — « Course longue : une position toutes les
30 s, envoi toutes les 10 min », « En direct jusqu'à 14:35 ») and their live map — the trail, the current position and its
accuracy, follow on or off —, in a long run allowing it « Passer en direct » (5, 15, 30 or 60 minutes) and « Revenir au rythme
lent », their alerts, « Enregistrer en GPX » of what was received, « Ne plus suivre ». **The watch is never in long mode**
(its battery lasts hours).

**The map** is drawn by the app itself from raster tiles (Web Mercator, 256 px), never an orienteering map. Each phone fetches
its own tiles from the providers, never through Ozimut (owner, 2026-11-23: Ozimut must not see where the people followed are, and
the providers' fair-use limits are per address); every request names the app (`User-Agent: Ozitrac/<version> (+https://ozimut.com)`),
a tile is kept on the phone 30 days, and nothing is fetched ahead of what is shown (OpenStreetMap's tile policy, which allows apps
on those terms). **The layers by country** (`GET /config`):

- `layers`: `[{ id, tiles, credit, maxZoom, name: { fr, en, de, es } }]` — `tiles` an address with `{z}`, `{x}`, `{y}`; past its
  `maxZoom` a layer's tile is its ancestor's part, enlarged.
- `areas`: `[{ id, name: { fr, en, de, es }, layers: [<layer id>…], poly: [[[lon, lat]…]…] }]` — the country's outline (Natural
  Earth, simplified to about 1 km), its layers in order, **the first the default**.
- `elsewhere`: `{ name, layers }` — the layers outside every area, the first the default.

A tile is drawn from an area's layer when its four corners lie inside that area's outline, else from the layer chosen for
« elsewhere »: tiles astride a border come from the default, so no part of the map is ever blank. The person chooses a layer per
area (« Fond de carte » on every map; the area the map's centre is in listed first), kept on the phone for every map. The credits
shown are those of the layers drawn. Today: France (metropolitan, Corsica) Plan IGN, IGN's aerial photos, OpenStreetMap; Switzerland
and Liechtenstein swisstopo's national map in colour or grey, SWISSIMAGE, OpenStreetMap; elsewhere OpenStreetMap. A country or a
layer is added on the server alone (`functions/_lib/ozitracmaps.js`, the outlines made by `tools/ozitrac_areas.py`); the app
needs no update.

**Identifiers**: Android and Wear OS application id `com.ozimut.ozitrac` (the code's namespace stays `com.ozimut.app`), name
« Ozitrac »; iPhone `com.ozimut.ozitrac`, its Apple Watch app `com.ozimut.ozitrac.watchkitapp`, its Live Activity
`com.ozimut.ozitrac.widget` and notification extension `com.ozimut.ozitrac.notify`, URL scheme `ozitrac`, universal links on
`/z/*` and `/t/*` (`site/.well-known/apple-app-site-association`). Ozimut's own pair codes and `/t/<code>` links stay as they
are.

**The watch** (Wear OS) is a watchee only: its channel of its own, its code shown as a QR code on the watch for a watcher's
phone, its watchers listed and removable, Ozimut by its claim code as before. **Its runs reach the paired phone by
themselves** whenever the two are connected (Bluetooth, Wi-Fi or the platform's cloud), never through the relay or Ozimut:
each finished run's file is a Wear OS Data Layer item `/ozitrac/run/<run>` holding it as an asset (`wear` `RunSync`), which
the phone's Ozitrac files in « Mes courses », marked « Enregistrée sur la montre », and then deletes (`app` `WatchRuns`); the
system keeps the item on the watch until then (20 waiting at most, the oldest dropped). Both apps must carry the same
application id and be signed with the same key (the Data Layer's rule). The Apple Watch does the same with WatchConnectivity's
`transferFile`.
