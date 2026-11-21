# Ozimut for Android

One store app: the whole live site (https://ozimut.com) in a web view, plus a native GPS tracker for runners
without a watch and for children followed by their parents. The contract it implements is
[`docs/track/design.md`](../../docs/track/design.md) (device protocol, the site ↔ app bridge, the tracker's rules).

Package `com.ozimut.app`, minSdk 26, target/compile SDK 36, Kotlin, plain Android views. Dependencies: AndroidX core and
activity, zxing-android-embedded (Apache-2.0) for the QR scanner, Firebase Messaging only when push is configured.
Nothing GPL.

## What is in it

| File | What |
|---|---|
| `MainActivity.kt` | The web view: JavaScript, DOM storage, file chooser with the camera, downloads (http, `blob:`, `data:`), other sites opened in the browser, Back through the history, user agent `… OzimutApp/<version> (android)`. App Links `https://ozimut.com/t/<code>` and `ozimut://…` (pair codes); files opened with or shared to the app (GPX, FIT, TCX, KMZ, KML, images, PDF) sent to the page as `{ type: "file", name, mime, data }`. |
| `Bridge.kt` | `window.OzimutNative.call(id, name, argsJson)`: `info`, `pair`, `unpair`, `openTracker`, `trackerState`, `selfTest`, `pushRegister`, `openSettings`; `healthRoutes` answers `[]` and `healthRoute` rejects « unsupported » (Health Connect to do). Answers by `window.__ozApp.resolve/reject`, events by `window.__ozApp.event`. Calls are refused unless the page is Ozimut's. |
| `TrackerService.kt` | The run: a foreground service of type location, the platform GPS provider at 1 s (no Play Services), each fix written at once to SQLite, a partial wake lock, the cap, `START_STICKY` with the state in SharedPreferences. Also runs the two-minute self-test. |
| `Batch.kt`, `FixDb.kt`, `Uploader.kt` | The queue and the batches (`/api/track/push`, gzip, the delta format; `ack`, `next`, `stop`, 401/409/413/429; retries 5 s doubling to 5 min, at once when a network returns). |
| `TrackerActivity.kt` | Start (name, « Suivi(e) par … », GPS, network, battery, Démarrer enabled by a first fix better than 20 m), Running (clock, distance, positions waiting, last sent, Stop held two seconds, « J'ai besoin d'aide » and the number to call), Ended (sent / waiting to send). |
| `PairActivity.kt` | Pairing by QR code or the 8 characters typed; then the web view is signed in (`/t/login#<token>`). |
| `SelfTestActivity.kt` | The two-minute test with the phone locked; on failure the maker's advice (Samsung, Xiaomi/Redmi/POCO, Huawei/Honor, OnePlus/Oppo/realme, others) and the battery settings. The app never asks for `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`. |
| `res/values*/strings.xml` | English (default), French, German, Spanish. |

The device key is encrypted with an AES key that never leaves the Android Keystore; nothing of the app is backed up.

## Building

Only in CI (the PC has no JDK or Android SDK): `.github/workflows/track-android.yml` runs on every push touching
`track/android/**` or the workflow, on any branch, and by hand. It runs the unit tests (the batch encoder and the queue),
`assembleDebug`, `assembleRelease` and lint (warnings not fatal), turns compiler errors into annotations, and uploads the
APKs and the reports as artifacts.

Locally, with JDK 17, the Android SDK and Gradle 8.14: `cd track/android && gradle testDebugUnitTest assembleDebug`.
A debug build may talk to another server: `-PozimutBase=https://…` (HTTPS only).

## What the owner provides

- **Release signing**: the repository secrets `ANDROID_KEYSTORE_BASE64` (the keystore, base64), `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. Without them the release APK is unsigned. Play wants an App Bundle:
  add `bundleRelease` to the workflow when publishing.
- **A Google Play developer account** (the store listing, the « Foreground service: location » declaration with its
  video, the data safety form: precise location, sent only between Start and Stop).
- **Push**: `track/android/app/google-services.json` from a Firebase project (not in the repository: put it there in CI
  from a secret). Without it the app builds without Firebase and `pushRegister` answers `{ ok: false, reason: "unconfigured" }`.
  The server side needs `FCM_SERVICE_ACCOUNT`.
- **App Links**: `https://ozimut.com/.well-known/assetlinks.json` with the release key's SHA-256 fingerprint, so that
  `https://ozimut.com/t/<code>` opens the app without asking.

## Not done

- Health Connect (`healthRoutes` / `healthRoute`): left as a TODO in `Bridge.kt`.
- A run restarted by the system after the process was killed: Android 12+ may refuse to start a location service from
  the background; the app then posts « Ta course a été interrompue », one tap brings it back. Never tried on real phones.
- The two-minute test's result is not sent to the server (design.md names `track_devices.test_ok` but no endpoint).
- Nothing was run on a real phone or against the real `/api/track/*` (the server side is built separately).
