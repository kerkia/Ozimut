# GPS tracking — what the owner does, step by step

Written 2026-11-22. The server, the site and the three native apps are built (`docs/track/design.md`); what is left needs the
owner's accounts, keys and devices. Do the steps in order: each part can be tested before the next. Nothing here is a secret:
the secrets are typed into the tools, never into this file or a chat.

Everything is visible only to administrators while `TRACK_OPEN` is "0" (wrangler.toml): Coach › « Suivi GPS », its
documentation chapter, the API. Nobody else sees anything until step 9.

## 0. Already done

- D1 migration 0029 applied to the live database (2026-11-22).
- The site deployed with the tracking (Coach › « Suivi GPS », administrators only).

## 1. The live relay — live view and alerts (about 10 minutes)

Without it, runs are kept and the watch page reads them every 20 s, but no alert is sent.

1. Make a long random secret, in PowerShell (it is copied to the clipboard, never shown):
   `-join ((1..48) | % { [char](Get-Random -Minimum 97 -Maximum 123) }) | Set-Clipboard`
2. Give it to the site: `npx wrangler pages secret put TRACK_RELAY_SECRET --project-name observatoire-cn`, run in
   `C:\Kerkia\Ozimut\Ozimut`, and paste when asked.
3. Give the same value to the relay: in `C:\Kerkia\Ozimut\Ozimut\live`, `npx wrangler secret put TRACK_RELAY_SECRET`, paste.
4. Deploy the relay: in `C:\Kerkia\Ozimut\Ozimut\live`, `npx wrangler deploy`. Its output must list the `TRACK` binding
   (class `LiveTrack`) and the migration `v3`.
5. In `wrangler.toml` (the repository's root), uncomment the four lines of the `LIVE_TRACK` binding, then commit and push
   (or ask Claude to). The next deploy binds the site to the relay.
6. Check: on ozimut.com, Coach › Suivi GPS opens without an error; a watch page (`#/suivi/<id>`) receives positions as they
   come (see step 3).

## 2. A first test without any app: Traccar Client (about 15 minutes)

This tests the server, the live page and the alerts with a free app, before the Ozimut apps.

1. On ozimut.com, signed in as an administrator: Coach › Suivi GPS › « Famille et appareils » › « Créer le compte d'un
   enfant » (a test child: any first name, a year of birth). Open its card.
2. In the child's card: « Traccar Client ». A QR code appears.
3. On a phone, install « Traccar Client » (Android: Google Play; iPhone: App Store). In its settings, scan the QR code (or
   copy the address into « Server URL »). Set the accuracy to « Highest », the interval to 5 s. Turn the service on.
4. Walk a few minutes outside. On the computer, Coach › Suivi GPS › « Suivre » › the child: the track appears (about
   40 s behind). Stop the service: after 3 minutes, the alert « plus de position » appears on the page (and as a
   notification once step 5 or 6 is done for your own phone).
5. « Mes traces » › the run: « Analyse solo », « GPX ».

## 3. The Android app, installed by hand (about 20 minutes)

1. On github.com/kerkia/Ozimut › Actions › « track-android » › the latest green run › « Artifacts » ›
   `ozimut-android-apks` (a zip). Inside: `app-debug.apk` (and an unsigned release APK, not installable).
2. Copy `app-debug.apk` to an Android phone (USB, e-mail to yourself, a cloud drive) and open it. Android asks to allow
   installing apps from that source: allow it for that one app (Files, Gmail…).
   Each CI build signs its debug APK with a new key: to install a newer build, **uninstall the old one first**.
3. Open the app: it is ozimut.com. Sign in with your account.
4. Coach › Suivi GPS › « Famille et appareils » › « Ce téléphone » › « L'associer à mon compte » (or, for the test child:
   its card › « Associer ce téléphone à <name> »).
5. « Test de deux minutes »: lock the screen, put the phone in a pocket, wait. If it fails, the app names the battery
   setting to change for this phone's maker and opens it.
6. « Démarrer le suivi », walk, stop by holding « Arrêter » two seconds. Watch it live from the computer.
7. Try « J'ai besoin d'aide » once: the help alert and the call button (the number set in the child's settings).

Notifications on the phone need step 6.

## 4. The Garmin data field (about 20 minutes)

The simplest way, whatever the watch model, is a private beta on the Connect IQ store:

1. Create a free Garmin developer account: developer.garmin.com (« Sign in » with your Garmin account), accept the
   Connect IQ developer agreement.
2. Make the developer key **once, and keep it for good** (a store app must always be signed with the same key). In Git
   Bash: `openssl genrsa -out garmin_key.pem 4096` then
   `openssl pkcs8 -topk8 -inform PEM -outform DER -in garmin_key.pem -out garmin_key.der -nocrypt`. Keep both files in
   `C:\Kerkia\Ozimut\data\secrets\` (backed up by Kopia, never in git).
3. Give it to GitHub: repository › Settings › Secrets and variables › Actions › New repository secret
   `GARMIN_DEVELOPER_KEY`, its value the base64 of the .der file: in PowerShell
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Kerkia\Ozimut\data\secrets\garmin_key.der")) | Set-Clipboard`, paste.
4. Optional, for publishing later: secrets `GARMIN_USERNAME`, `GARMIN_PASSWORD` (your developer login) and
   `GARMIN_AGREEMENT_HASH`, so CI downloads Garmin's own SDK files (see `track/garmin/README.md`).
5. Ask Claude to run the « track-garmin » workflow again (or push any change under `track/garmin`), then download the
   artifact `ozimut-garmin` › `ozimut.iq`.
6. apps.garmin.com › Developer Dashboard › « Upload an app » › `ozimut.iq`, type « Data field », and tick **Beta app**:
   only you see it. Install it from the Connect IQ app on your phone.
7. On the watch: an activity's settings › Data Screens › a screen › a field › Connect IQ › Ozimut. Open the activity:
   the field shows a 6-character code. On ozimut.com › Suivi GPS › « Famille et appareils » › « Associer une montre »:
   type it. The field says « ready » within ten seconds. Start the activity's timer: the run is live.

The phone stays paired in Garmin Connect, with Bluetooth on and mobile data.

## 5. Notifications on Android (Firebase, about 20 minutes)

1. console.firebase.google.com › « Add project » (« Ozimut », Analytics not needed).
2. « Add app » › Android › package name `com.ozimut.app` › download `google-services.json`.
3. GitHub secret `GOOGLE_SERVICES_JSON`: the file's content (open it in Notepad, copy all). Then ask Claude to make the
   workflow write it to `track/android/app/google-services.json` before the build (one line to add).
4. Firebase › Project settings › Service accounts › « Generate new private key »: a JSON file. In
   `C:\Kerkia\Ozimut\Ozimut`: `npx wrangler pages secret put FCM_SERVICE_ACCOUNT --project-name observatoire-cn`, paste the
   whole JSON (one line is fine). Delete the downloaded file afterwards (or keep it in `data\secrets`).
5. Reinstall the new APK (step 3): the app asks for notifications once paired.

## 6. The iPhone and Apple Watch apps (several days: Apple's account and review)

1. Join the Apple Developer Program (developer.apple.com/programs, 99 USD a year, needs your Apple ID with two-factor
   authentication; a few days for an individual). Note the **Team ID** (Membership details).
2. developer.apple.com › Certificates, Identifiers & Profiles › Identifiers: register `com.ozimut.app` (capabilities:
   Associated Domains, HealthKit, Push Notifications), `com.ozimut.app.watchkitapp` (HealthKit), `com.ozimut.app.widget`.
3. Keys › « + » › Apple Push Notifications service (APNs) › download the `.p8` key, note its Key ID. Then:
   `npx wrangler pages secret put APNS_KEY --project-name observatoire-cn` (paste the .p8 file's whole text),
   `APNS_KEY_ID` (the key's id), `APNS_TEAM_ID` (the Team ID), `APNS_TOPIC` (`com.ozimut.app`).
4. App Store Connect (appstoreconnect.apple.com) › Users and Access › Integrations › App Store Connect API › generate a key
   (role App Manager): note the Issuer ID and Key ID, download the `.p8`. GitHub secrets `APPLE_TEAM_ID`,
   `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY` (the .p8's text).
5. App Store Connect › Apps › « + » › New App: iOS, name « Ozimut », bundle `com.ozimut.app`.
6. Tell Claude the Team ID: it writes it into `site/.well-known/apple-app-site-association` and adds the signing and
   TestFlight job to the workflow. Then the build goes to TestFlight; install TestFlight on your iPhone and accept.
7. Test as in step 3; on the watch, the app shows a code, or the iPhone pairs it.

## 7. Polar (optional, about 15 minutes)

1. admin.polaraccesslink.com › sign in with a Polar account › create a client: redirect URL
   `https://ozimut.com/api/track/polar/callback`. Note the client id and secret.
2. Create the webhook (AccessLink's API, event EXERCISE, URL `https://ozimut.com/api/track/polar/webhook`) and note its
   signature secret — or ask Claude for the one command that does it with the client id and secret.
3. Pages secrets: `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET`, `POLAR_WEBHOOK_SECRET`.
4. Suivi GPS › « Mes traces » › « Relier Polar ».

## 8. Publishing Android on Google Play (when the tests are good)

1. play.google.com/console: a developer account (25 USD once; identity check; a personal account must run a closed test
   with 12 testers for 14 days before going public).
2. Make the release keystore **once, kept for good**: `keytool -genkeypair -v -keystore ozimut-release.jks -alias ozimut
   -keyalg RSA -keysize 4096 -validity 10000` (keytool comes with any Java; or Android Studio › Build › Generate Signed
   Bundle). Keep it in `data\secrets`.
3. GitHub secrets `ANDROID_KEYSTORE_BASE64` (base64 of the .jks, as in step 4.3), `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS` (`ozimut`), `ANDROID_KEY_PASSWORD`. Ask Claude to add the App Bundle to the workflow.
4. Tell Claude the key's SHA-256 (`keytool -list -v -keystore ozimut-release.jks`, the « SHA256 » line; or Play Console ›
   App integrity once Play signs): it goes into `site/.well-known/assetlinks.json`, so that `ozimut.com/t/<code>` links open
   the app.
5. Play Console › the app › the « Foreground service: location » declaration (a short video of the tracker running with
   the screen locked) and the data safety form (location, account, health data — the privacy page says what).

## 9. Opening to everyone

When the tests are good: `TRACK_OPEN = "1"` in `wrangler.toml`, push. Coach › Suivi GPS, its documentation chapter and the
year of birth at registration then appear for every account, and nobody under 15 registers alone.
