# Ozitrac for Android

**Ozitrac** (2026-11-23): a native app that records a run, keeps it on the phone, and shows it live to the people who
follow it — family, friends — through Ozitrac's relay on ozimut.com, end-to-end encrypted. No account: a phone makes its
own channel, a watcher joins by scanning a code. A phone may also be linked to an Ozimut account (« Relier à Ozimut »), and
its runs then go there too. The contract is [`docs/track/ozitrac.md`](../../docs/track/ozitrac.md) (the relay's API, the
code, the sealing, the batches, the alerts); the Ozimut side keeps [`docs/track/design.md`](../../docs/track/design.md)
(pairing, `/api/track/push`).

Application id `com.ozimut.ozitrac` (the code's namespace stays `com.ozimut.app`), version 1.0.0, minSdk 26, target/compile
SDK 36, Kotlin, plain Android views built in code, no web view. Dependencies: AndroidX core and activity,
zxing-android-embedded (Apache-2.0) for the QR codes, Firebase Messaging only when push is configured. No map library:
the map is the app's own view. Nothing GPL. No price, subscription or buying link anywhere.

## What is in it

| File | What |
|---|---|
| `HomeActivity.kt` | The launcher. Two tabs. **« Ma course »**: start or open the run, the first name put in codes, « Qui me suit » (the watchers by name, each removable), « Ajouter quelqu'un », « Mes courses », the zone, the two-minute test, « Relier à Ozimut » / unlink. **« Je suis »**: scan a code; the people followed, each with their state (running for, last position, battery) — a tap opens their map. Refreshes the watchers and the people followed every minute while shown. |
| `TrackerActivity.kt` | Start (who follows, GPS, network, battery, « Partager en direct », Start enabled by a fix better than 20 m), Running (clock, distance, positions waiting or « kept on this phone only », Stop held two seconds, Help and the number to call when linked), Ended (sent, waiting, or kept). |
| `TrackerService.kt` | The run: a foreground service of type location, the platform GPS at 1 s, each fix written at once to the run's file (`RunLog`) and to the queue of each destination — Ozimut (`Uploader`, when linked) and the relay (`RelaySender`, when someone follows and « share » is on); the run ends once every destination has sent its last batch. The device alerts (battery under 15 % once, still, out of the zone). Also the two-minute self-test. |
| `Relay.kt` | Ozitrac's relay client: `Me` (the first name), `RelayConfig` (`GET /api/ozitrac/config`, the map's tiles), `Channel` (made lazily, `c`/`cs` kept encrypted by the Keystore's key; codes `{ i, k }` kept 24 h; the watchers matched to their keys by opening their sealed names, AAD `<c>|name`), `Alerts`, `Zone`, `AlertWatch`, `RelaySender` (a second sender beside `Uploader` on the queue `z:<run>`: a batch sealed for every watcher, `ack`/`next`, 401/404/409/413/429; idle without a watcher, the queue dropped at the end when nobody followed). |
| `TrackForm.kt` | The pure parts, shared with the watch and unit-tested: base64url, `Seal` (AES-256-GCM, IV ‖ ciphertext ‖ tag; AAD `<c>|<w>|<run>|<seq>` for batches), the delta form `{ t0, dt, la, lo, ac, al? }`, `Codes` (the code link `https://ozimut.com/z/<c>#<i>.<k>.<name>`), `Gpx`, `Geo`. |
| `Follows.kt` | The people followed: joining (`POST /<c>/join`, the name sealed), the push token per channel, reading a run (`GET /<c>/w/<w>?run=&since=`, the blobs opened and kept in `filesDir/follow/<c>.csv`), unfollowing. |
| `FollowActivity.kt` | A person followed, live: read every `next` s while shown, the trail, the position and its accuracy on the map, follow mode, the last alerts, « Enregistrer en GPX », « Ne plus suivre ». |
| `InviteActivity.kt`, `JoinActivity.kt` | A new code as a QR code and a link to send; following from a scanned code or the App Link `https://ozimut.com/z/…` (the first name asked once). |
| `RunsActivity.kt` | The runs kept on the phone (`filesDir/runs/<run>.csv`): seen on the map, shared or saved as GPX (made on demand, `FileProvider`), deleted. |
| `ZoneActivity.kt` | The zone: the map's centre under the cross (or « Ma position »), a radius, the alert on or off. |
| `TileMapView.kt` | The map: Web Mercator, 256 px tiles from the relay's template (OpenStreetMap by default) with the user agent `Ozitrac/<version>`, a memory LRU and a disk cache (30 days), two loaders, pan, pinch, double tap, the trail, the position and its accuracy, the zone, the credit, follow mode. |
| `Batch.kt`, `FixDb.kt`, `Uploader.kt`, `Device.kt`, `Pairing.kt`, `PairActivity.kt` | The Ozimut side, used only when the phone is linked: the batches to `/api/track/push`, pairing by QR code or the 8 characters (also the App Link `https://ozimut.com/t/<code>`), the device key kept encrypted by the Android Keystore. |
| `Notifs.kt`, `src/fcm`/`src/nofcm` | The run's notifications; the alerts about a person followed (channels « Alertes » and, high importance, help, silence and zone), from FCM data messages `{ app: "ozitrac", c, kind, t, run }`, opening that person's map. |
| `SelfTestActivity.kt` | The two-minute test with the phone locked; on failure the maker's advice and the battery settings. |
| `res/values*/strings.xml` | English (default), French (« tu »), German (« du »), Spanish (« tú »). |

Nothing of the app is backed up or moved to another phone.

## The Wear OS app (`wear/`)

A watch with its own mobile connection (Samsung Galaxy Watch LTE, Google Pixel Watch LTE…) records and sends without a
phone. Same application id `com.ozimut.ozitrac` (Play lists it with the phone app), minSdk 30, standalone, version codes
300 000 000 + the build's number. **The recording, the run's file, the relay and the sending are the phone app's own
files** — `Batch.kt`, `FixDb.kt`, `Device.kt`, `Http.kt`, `Uploader.kt`, `Tracker.kt`, `Phone.kt`, `TrackerService.kt`,
`TrackForm.kt`, `Relay.kt`, `RunLog.kt` — compiled into the watch app as they are (`wear/build.gradle.kts` `SHARED`):
change them in `app/`, both apps follow. The watch's own: `WatchActivity.kt` (Start; during a run the clock, the distance,
the GPS, whether positions get through, Help and Stop each held two seconds; between runs « Ajouter quelqu'un » — the
watch's own channel and a code shown as a QR code for the watcher's phone, drawn with zxing core 3.5.3 —, « Qui me suit »
with each watcher removable (held), and « Relier à Ozimut » by the claim code typed on the site), `Claim.kt`, `Notifs.kt`.
The watch keeps its last 5 runs. Strings in four languages.

## Building

Only in CI: `.github/workflows/track-android.yml` runs on every push touching `track/android/**` or the workflow. It runs
the unit tests (the sealing against the JDK's own AES-GCM, the delta form, the code link, the GPX file, the batches and the
queue), `assembleDebug`, `assembleRelease` and lint for both modules, and uploads the APKs (`ozitrac-android-apks`,
`ozitrac-wearos-apks`) and the reports.

Locally, with JDK 17, the Android SDK and Gradle 8.14: `cd track/android && gradle testDebugUnitTest assembleDebug`.
A debug build may talk to another server: `-PozimutBase=https://…` (HTTPS only).

## What the owner provides

- **Release signing**: the secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`. Without them the release APK is unsigned.
- **A Google Play developer account** for `com.ozimut.ozitrac` (the « Foreground service: location » declaration, the data
  safety form: precise location, sent only between Start and Stop, end-to-end encrypted to the watchers).
- **Push**: `track/android/app/google-services.json` from a Firebase project whose Android app is `com.ozimut.ozitrac`.
  Without it the app builds without Firebase: the alerts are seen only when the person's map or the list is open.
- **App Links**: `https://ozimut.com/.well-known/assetlinks.json` must name `com.ozimut.ozitrac` and the release key's
  SHA-256, so that `https://ozimut.com/z/…` and `/t/…` open the app without asking.

## Not done

- Nothing was run on a real phone or watch, nor against the real relay.
- Health Connect, a run restarted after the process was killed on Android 12+ (a notification brings it back).
- A follower's alerts without FCM come only while the app is open.
