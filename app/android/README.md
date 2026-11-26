# Ozimut for Android — the companion app

The live site (https://ozimut.com) in a web view, plus what a page cannot do: native notifications, files opened with or
shared to the app, the camera and the document scanner for map photos, handing a file the site made to the share sheet.
The contract with the site and the server is [`docs/app/design.md`](../../docs/app/design.md): change it first, then this code.

**It does not track** (that is Folloz, https://github.com/kerkia/Folloz), **creates no account, and shows nothing about buying**: a checkout
host is neither loaded nor handed to the browser, whatever a page asks.

Application id `com.ozimut.app`, code namespace `com.ozimut.web`, name « Ozimut », minSdk 26, targetSdk 36.

## What is here

| Path | What |
|---|---|
| `app/src/main/java/com/ozimut/web/Policy.kt` | Where an address may go: the site's origin in the view, anything else to the browser, a checkout host nowhere. Pure Kotlin, unit-tested (`PolicyTest`). |
| `MainActivity.kt` | The web view (user agent ` OzimutApp/<version> (android)`), navigation, `window.open`, the file chooser (camera, photos, files), the position permission (« while using the app »), the no-network screen, the intents (a tapped notification, files opened or shared), the events held until the page's first `info` call. |
| `Bridge.kt` | `window.OzimutNative.call(id, name, argsJson)`: `info`, `pushState`, `pushRegister`, `pushOff`, `saveFile`, `scanMap`, `openSettings`. Answers only when the page shown is the site's. |
| `Files.kt` | Files in (name, type, base64; 40 MB each at most) and out (cache + FileProvider + the share sheet). |
| `Notifs.kt`, `App.kt` | The channels « alerts » and « help » (the names the server sends), a notification shown while the app is in front. |
| `app/src/fcm`, `app/src/nofcm` | `PushSupport` and the messaging service with Firebase, or their empty stand-ins without it. |
| `app/src/test` | `PolicyTest`, `BridgeTest`. |

## Building

No Gradle wrapper is kept in the repository and there is no JDK on the PC: GitHub Actions builds it,
[`.github/workflows/app-android.yml`](../../.github/workflows/app-android.yml), on every push touching `app/android/**` and by
hand. It runs the unit tests, builds the debug and (minified) release APKs and lint, and keeps the APKs as the artifact
**`ozimut-app-apk`**. With a JDK 17 and Gradle 8.14: `gradle testDebugUnitTest assembleDebug` in this folder;
`-PozimutBase=http://10.0.2.2:8788` points a debug build at a local server (cleartext addresses also need
`android:usesCleartextTraffic` in a debug manifest, not there).

Secrets the workflow reads (all optional):

| Secret | Effect |
|---|---|
| `APP_GOOGLE_SERVICES_JSON` | base64 of the Firebase `google-services.json` holding an Android app of package **`com.ozimut.app`**: the build then includes FCM (native notifications). Without it: no notifications, `pushState` answers « unavailable ». |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | The same names as Folloz's workflow: the release APK is signed and a signed bundle is kept as **`ozimut-app-aab`** (what Google Play takes). |

## Trying it on a phone (sideloading)

1. GitHub › Actions › « app-android » › the latest run › Artifacts › `ozimut-app-apk`; unzip it.
2. Copy `debug/app-debug.apk` to the phone (or `adb install -r app-debug.apk`), open it, and allow « install unknown apps »
   for the app used to open it.
3. A debug build is signed with the build machine's debug key, which changes: uninstall it before installing a release build.

## Choices made

- **The page registers the notification token** (the shell holds no credential and calls no server): `pushRegister` asks the
  permission (Android 13+), gets the FCM token and answers `{ ok, kind: "fcm", token, env: "prod" }`. A token Firebase renews
  is sent again at the page's next `pushRegister`. `pushOff` (beyond the contract's table) deletes the token on the phone.
- **Checkout hosts are refused three times**: `shouldOverrideUrlLoading` (never loaded), `shouldInterceptRequest` (nothing of
  theirs fetched, whatever asks), and again before anything is handed to the browser.
- **Only web addresses, `mailto:`, `tel:`, `sms:` and `geo:` leave the app**; `intent:`, `market:` and the like are dropped.
- **The bridge answers by the page shown**, not by the calling frame: a frame of another host (the anti-robot check) sees
  `OzimutNative` too, and is answered as the page would be. The main frame is never another origin.
- **Files the site saves** go to the share sheet (save to the phone's files, send to another app), not silently to Downloads.
  A file the site itself serves (a real address on its origin) goes through the system's download manager.
- **The scanner** is Google Play services' document scanner (ML Kit, `16.0.0-beta1`): nothing bundled, one page, JPEG. The
  feature « scan » is announced only where Play services are present; no `CAMERA` permission is declared (the scanner and the
  camera app take the picture, not this app).
- **No App Links**: an `https://ozimut.com/…` link in an e-mail opens the browser, as before.
- **Nothing is backed up** (`data_rules.xml`): a new phone signs in again.

## Never run on a device

All of it. Only compiled and unit-tested by the workflow. To check first on a real phone: the file chooser with the
camera, a GPX shared from a watch maker's app (which type and address it gives), the scanner, a notification tapped with
the app closed and open, the position prompt in the map editor's field mode, `window.open` links, the anti-robot check
inside the web view, and large files through the bridge (tens of megabytes as base64).
