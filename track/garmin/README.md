# Ozimut — the Garmin data field

A Connect IQ **data field** (Monkey C) that sends an orienteering run to Ozimut live. The runner adds it once to an
activity profile (Orienteering, Run, Trail Run…). During Garmin's own activity — which still records its FIT file as
always — the field keeps the watch's position every second while the timer runs and sends it in batches to
`https://ozimut.com/api/track/push` through the paired phone (Garmin Connect's Bluetooth link). Watchers follow the run
live, and the track is in the runner's « Mes traces » at the finish, without any file to upload.

The protocol is the contract `docs/track/design.md` (« Watches: claim codes », « Sending »).

## For the runner

1. Install « Ozimut » from the Connect IQ store (Garmin Connect app › Connect IQ Store, or the Connect IQ app).
2. On the watch: the activity's settings › Data Screens › choose a screen › a field › Connect IQ › Ozimut. A 1-, 2- or
   3-field screen reads best; the field also fits the small fields of 4-field screens.
3. Open that activity (no need to start it): the field shows `Ozimut` and `not paired ABC123` (in the watch's language).
4. On ozimut.com, signed in: « Mes appareils » (or « Famille » for a child) › « Associer une montre », type the six
   characters. Within ten seconds the field says `ready`. This is done once; the watch stays paired to that account
   until it is removed from the site.
5. From then on, starting the activity's timer starts a run: the field says `live` once the server has acknowledged
   a batch, `waiting (n)` while n positions wait to be sent, `no phone` when the phone is out of reach (the positions
   are kept and sent when it comes back), `stopped` when the server ended the run (a parent ended it).

The phone must be paired with the watch in Garmin Connect, with Bluetooth on and Garmin Connect allowed to run in the
background; the phone needs mobile data.

## What it does

- **Pairing**: at its first start the field makes its key (32 base64url characters) and a claim code (6 characters of
  `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`) from `Cryptography.randomBytes` (cryptographically random, API 3.0.0, used
  when `Toybox has :Cryptography`). Should a device lack it, the fallback is `Math.rand` seeded with the clock, the system timer and
  a hash of the device's unique identifier — a linear generator, guessable by someone who knows those values, so only
  a fallback. Both are kept in `Application.Storage`. While unpaired it posts `/api/track/claim` every 10 s (with
  the watch's part number as `model`) until the answer is `200 { paired: true }`.
- **Recording**: `compute(info)` runs about once a second. While `info.timerState == TIMER_STATE_ON` it keeps
  `info.currentLocation` when `info.currentLocationAccuracy` is `QUALITY_POOR` or better (a last-known position is
  never kept), one fix per second, with `info.altitude`. `Position.Quality` has no metres; the accuracy sent is
  5 m (good), 10 m (usable), 25 m (poor, a 2-D fix).
- **The run**: its id `r_<UTC start>_<4 base36>` is made at the timer's first start (`onTimerStart`, or the first
  computation with the timer on if the field was paired mid-activity); `seq` 1, 2, 3…; `share` "watchers".
  `onTimerStop` sends what is held at once (the activity may still be saved); `onTimerReset` (the activity saved or
  discarded) sends the last batch with `state: "end"`.
- **Sending**: a batch of at most 60 fixes every `next` seconds (30 until the server answers), one request at a time,
  `Authorization: Bearer <key>`, JSON (`Communications.makeWebRequest`, `REQUEST_CONTENT_TYPE_JSON`). Fixes are
  forgotten only once acknowledged (`ack` ≥ the batch number). A failed batch is sent again with exactly the same fixes
  under the same number (the server ignores a number it already holds). After a success, a backlog of a full batch
  or more is sent at once, batch after batch. Answers: `401` the device was removed — the field forgets its key and
  shows a new code; `stop: true` — the run ends, nothing more this activity; `409` — the server closed the run (its
  cap): what is held starts a new run; `413` — smaller batches; `429` — wait `next` (60 s by default); no phone
  (`BLE_CONNECTION_UNAVAILABLE`, -104) — try again in 30 s; any other failure — again in 15 s.

## Memory budget

The device files (read by `tools/check_devices.py` in CI) give a data field **128 KB** (fēnix 8, Enduro 3, Instinct 3
AMOLED, Forerunner 970) or **256 KB** (all the others). The code and its texts take a small part of it. The backlog
is five arrays of Numbers (time, latitude, longitude, accuracy, altitude), allocated once in `initialize` with
`capacity()`: a quarter of the memory free at that moment, counted at 40 bytes a fix (generous: an array slot holds a
Number in a few bytes), between 120 fixes (2 minutes) and 3600 (an hour). On 128 KB that is roughly 10-15 minutes of
fixes without a phone; on 256 KB about half an hour. A quarter, not more, because a batch (a Dictionary of six arrays
of up to 60 Numbers) and its JSON copy in the system's queue are built beside it. When the backlog is full the fixes
not in flight are halved (every other one kept, oldest first): the run keeps its whole length, one fix in two, then
one in four…, and the field adds `1 fix in 2` to its status.

## Building

CI: `.github/workflows/track-garmin.yml` (any branch, on a push touching `track/garmin/**` or the workflow, and by
hand). It compiles for fr255, fenix7, fr965 and venu3 with the strictest type checking (`-l 3`) and exports the store
package `ozimut.iq` for every product of the manifest (artifact `ozimut-garmin`). The SDK and device files:

- **with the owner's Garmin developer login** — repository secrets `GARMIN_USERNAME`, `GARMIN_PASSWORD` and
  `GARMIN_AGREEMENT_HASH` (the hash `connect-iq-sdk-manager agreement view` prints) — through
  [lindell/connect-iq-sdk-manager-cli](https://github.com/lindell/connect-iq-sdk-manager-cli) (Apache-2.0), which
  downloads the SDK and the manifest's devices as Garmin's SDK Manager does;
- **without them**, copied out of the public image `ghcr.io/matco/connectiq-tester` (its scripts under the
  Unlicense; the device files inside are Garmin's, fetched by its author with the SDK Manager — fine for a test build,
  but use the login route for anything published).

The store's developer key: secret `GARMIN_DEVELOPER_KEY` (base64 of the DER file); without it CI makes a throwaway key
(`openssl genrsa` + `openssl pkcs8 -topk8 -outform DER -nocrypt`), good for testing only — an app on the store must
always be signed with the same key. Never commit a key.

Locally: install the SDK with Garmin's SDK Manager, then from `track/garmin`:
`monkeyc -d fr965 -f monkey.jungle -o ozimut.prg -y <key.der> -l 3` and `connectiq` / `monkeydo ozimut.prg fr965` in
the simulator. A debug build (without `-r`) uses the `(:debug)` `baseUrl()` in `source/OzimutField.mc`: point it at a
development server there.

Checking the device list: `python tools/check_devices.py <Devices folder>` prints each product's Connect IQ version,
data-field memory and screen, and fails on a product missing or below API 5.0.0. All 37 products of the manifest
(47 devices with their variants) are at 5.2.0 or later in SDK 9.3.0's device files.

## Publishing on the Connect IQ store

1. A free Garmin developer account (developer.garmin.com), the owner's.
2. Make the developer key once (as above), keep it safe (Kopia, and as the `GARMIN_DEVELOPER_KEY` secret).
3. Build `ozimut.iq` with that key (CI artifact), upload it at apps.garmin.com › Developer Dashboard › « Upload an app »:
   name, description in the four languages, screenshots (the simulator), category « Data fields », the privacy text
   (positions sent to ozimut.com while the activity timer runs, to the paired account; link to the privacy page).
4. Garmin's review takes up to two weeks; updates are reviewed again (usually faster). Bump `VERSION` in
   `source/OzimutField.mc` and the store's version together.

## Not done

- **Not run on a watch, nor in the simulator** (no SDK on the PC; CI compiles only). To try: the simulator with a GPX
  played through « Simulation › Activity Data », and a real watch with a phone — the server side
  (`/api/track/claim`, `/api/track/push`) must exist first.
- Whether `compute` (and so the sending) keeps running while another data screen is shown is not stated in Garmin's
  API documentation. To check on a watch.
- What happens to a request in flight at `onTimerReset`, when the activity closes, is not documented: the `end` batch
  is best effort; the server closes the run itself after its silence rule.
- The backlog lives in memory only: if the field is restarted mid-run (the profile changed, the watch rebooted), the
  fixes not yet sent are lost (they stay in Garmin's FIT file) and a new run starts.
- `bat` is the watch's battery; `lp` is always false, `left` always 0 (the field does not know the phone's state).
- `al` is sent when the watch gives an altitude; before its first altitude the field sends 0.
- No help button (a data field takes no input), no settings: the batch interval is the server's.
- The launcher icon is the Ozimut mark, 70 × 70 (the largest size the watches ask; the SDK scales it down), drawn with the
  other apps' icons by `track/tools/make_icons.py`.
