# GPS tracking — what the owner does, step by step

Written 2026-11-22, for Ozitrac since 2026-11-23. The server, the site and the native apps are built (`docs/track/design.md`,
`docs/track/ozitrac.md`); what is left needs the
owner's accounts, keys and devices. Do the steps in order: each part can be tested before the next. Nothing here is a secret:
the secrets are typed into the tools, never into this file or a chat.

Everything is visible only to administrators while `TRACK_OPEN` is "0" (wrangler.toml): Coach › « Suivi GPS », its
documentation chapter, the API. Nobody else sees anything until step 9, except the testers: accounts whose `users.preview`
in D1 names `track` (Alec and Nadejda since 2026-11-23). To add one, ask Claude, or run in `C:\Kerkia\Ozimut\Ozimut`
`npx wrangler d1 execute ocn --remote --command "UPDATE users SET preview = 'track' WHERE id = <id>"` (keep any feature
already in that column, separated by a comma).

## 0. Already done

- D1 migration 0029 applied to the live database (2026-11-22).
- The site deployed with the tracking (Coach › « Suivi GPS », administrators only).
- Step 1, the live relay: `TRACK_RELAY_SECRET` set on the site and the relay, `ocn-live` deployed with `LiveTrack`,
  the `LIVE_TRACK` binding uncommented (2026-11-23).
- **Ozitrac** (2026-11-23, `docs/track/ozitrac.md`): the tracking app is now a product of its own, used without an account.
  Its relay (`TracChannel`) deployed in `ocn-live`, the site's `OZITRAC` binding and `/api/ozitrac` live. The steps below
  are written for it.

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

1. On ozimut.com, signed in as an administrator: Coach › Suivi GPS › « Famille et appareils » › « Pour qui ? » ›
   « + Ajouter un enfant » (a test child: any first name, a year of birth). The page then shows that child.
2. Under the child's name: « Traccar Client pour <prénom> ». A QR code appears.
3. On a phone, install « Traccar Client » (Android: Google Play; iPhone: App Store). **In Traccar Client**, open its settings
   and tap the QR code icon at the top, then scan the code on the computer — not with the phone's camera, which opens a page
   of Ozimut explaining this (its « Ouvrir dans Traccar Client » button also works when that page is on the phone). The code
   sets the address, the accuracy « highest » and the 5 s interval. Without scanning: paste the address into « Server URL »,
   set the accuracy to « highest » (« medium » by default) and the interval to 5 s. Turn the service on.
4. Walk a few minutes outside. On the computer, Coach › Suivi GPS › « Suivre » › the child: the track appears (about
   40 s behind). Stop the service: after 3 minutes, the alert « plus de position » appears on the page (and as a
   notification once step 5 or 6 is done for your own phone).
5. « Mes traces » › the run: « Analyse solo », « GPX ».

## 3. Ozitrac on Android, installed by hand (about 20 minutes, two phones)

1. On github.com/kerkia/Ozimut › Actions › « track-android » › the latest green run › « Artifacts » ›
   `ozitrac-android-apks` (a zip). Inside: `app-debug.apk` (and an unsigned release APK, not installable).
2. Copy `app-debug.apk` to an Android phone (USB, e-mail to yourself, a cloud drive) and open it. Android asks to allow
   installing apps from that source: allow it for that one app (Files, Gmail…).
   Each CI build signs its debug APK with a new key: to install a newer build, **uninstall the old one first**.
   An « Ozimut » app installed before 2026-11-23 is another app (`com.ozimut.app`): uninstall it.
3. Open Ozitrac: it asks your first name. No account, no sign-in.
4. **Without Ozimut** (the basic use): on the phone to be followed, « Ma course » › « Qui me suit » › « Ajouter quelqu'un »
   shows a QR code. On a second phone with Ozitrac, « Je suis » › « Scanner un code » scans it (or open the shared link).
   The first phone now lists that follower.
5. « Test de deux minutes »: lock the screen, put the phone in a pocket, wait. If it fails, the app names the battery
   setting to change for this phone's maker and opens it.
6. « Démarrer une course », walk outside, stop by holding « Arrêter » two seconds. On the second phone, the person's map shows the
   trail live (about 15 s behind while you look). « Mes courses » keeps the run: share it as GPX.
7. Try « J'ai besoin d'aide » once: the second phone shows it at once on the map; as a notification once step 5 is done.
8. **With Ozimut**: on ozimut.com › Coach › Suivi GPS › « Famille et appareils » › the person › « Associer un téléphone »:
   a code. In Ozitrac › « Relier à Ozimut », scan or type it. From then on every run also goes to that account
   (« Mes traces », the analyses), and Ozimut's own watchers follow on the site.

## 3b. The Wear OS app on a watch with 4G, installed by hand (about 20 minutes)

For a Wear OS watch with its own mobile connection (Samsung Galaxy Watch 4 or later in LTE, Google Pixel Watch LTE…).
A watch without 4G works too on Wi-Fi, which is enough to test at home.

1. On github.com/kerkia/Ozimut › Actions › « track-android » › the latest green run › « Artifacts » ›
   `ozitrac-wearos-apks` (a zip). Inside: `wear-debug.apk`.
2. On the PC, install Google's adb once: `winget install Google.PlatformTools`, then open a new PowerShell.
3. On the watch: Settings › System › About › tap « Build number » (Samsung: « Software information » › « Software
   version ») seven times; then Settings › Developer options › turn on « ADB debugging » and « Wireless debugging »
   (the watch and the PC on the same Wi-Fi). « Wireless debugging » › « Pair new device » shows an address and a code.
4. On the PC: `adb pair <address:port shown> <code shown>`, then `adb connect <address:port of « Wireless debugging »>`,
   then `adb install <path>\wear-debug.apk`.
5. Open « Ozitrac » on the watch. To be followed without Ozimut: its « Qui me suit » shows a QR code, which a phone's
   Ozitrac scans (« Je suis » › « Scanner un code »). With Ozimut: its code « ABC DEF », typed on ozimut.com › Suivi GPS ›
   « Famille et appareils » › the person › « Associer une montre ». Then the watch shows « Démarrer ».
6. « Démarrer » (allow the location), walk outside, watch it live from the computer; « Aide » and « Arrêter » are each
   held two seconds. To test without a phone, turn the phone's Bluetooth off: the watch then uses its own 4G (or Wi-Fi).

Each CI build signs its debug APK with a new key: uninstall the old one first (`adb uninstall com.ozimut.ozitrac`).

## 4. The Garmin data field — set aside (2026-11-23)

The owner set it aside: a Garmin watch sends only through its phone, which can then track by itself (step 3). The code stays
in `track/garmin`; nothing on the site offers it. If it is ever taken up again, the simplest way, whatever the watch model, is
a private beta on the Connect IQ store:

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

Without it, a follower sees the alerts only while Ozitrac is open.
« Ma course » › « Mes données » › « Effacer mes données » removes everything the relay holds for that phone.

1. console.firebase.google.com › « Add project » (« Ozitrac », Analytics not needed).
2. « Add app » › Android › package name `com.ozimut.ozitrac` › download `google-services.json`.
3. GitHub secret `GOOGLE_SERVICES_JSON`: the file's content (open it in Notepad, copy all). Then ask Claude to make the
   workflow write it to `track/android/app/google-services.json` before the build (one line to add).
4. Firebase › Project settings › Service accounts › « Generate new private key »: a JSON file. In
   `C:\Kerkia\Ozimut\Ozimut`: `npx wrangler pages secret put FCM_SERVICE_ACCOUNT --project-name observatoire-cn`, paste the
   whole JSON (one line is fine). Delete the downloaded file afterwards (or keep it in `data\secrets`).
5. Reinstall the new APK (step 3) on the following phone: it asks for notifications when it starts following.

## 5b. The map's tiles, before the public release (about 15 minutes)

Ozitrac draws its map from OpenStreetMap's own tiles until then, which OpenStreetMap allows only for light use (its tile
policy forbids an app's heavy use). Before publishing, take a tile provider with a free tier — MapTiler (maptiler.com,
« Streets » or « Outdoor » raster tiles), Stadia Maps or Thunderforest — and its key, then in `wrangler.toml` `[vars]`:
`OZITRAC_TILES = "https://…/{z}/{x}/{y}.png?key=…"` and `OZITRAC_TILES_CREDIT = "© MapTiler © OpenStreetMap"` (the
provider's own credit), push. The apps read them from `/api/ozitrac/config`: no new app is needed. A key in wrangler.toml
is public (the repository is): take one the provider restricts to the app or to ozimut.com, or ask Claude to make it a
Pages secret.

## 6. The iPhone and Apple Watch apps (several days: Apple's account and review)

1. Join the Apple Developer Program (developer.apple.com/programs, 99 USD a year, needs your Apple ID with two-factor
   authentication; a few days for an individual). Note the **Team ID** (Membership details).
2. developer.apple.com › Certificates, Identifiers & Profiles › Identifiers: register `com.ozimut.ozitrac` (capabilities:
   Associated Domains, HealthKit, Push Notifications), `com.ozimut.ozitrac.watchkitapp` (HealthKit),
   `com.ozimut.ozitrac.widget`. Claude then turns the iPhone and Apple Watch apps into Ozitrac (as Android on 2026-11-23).
3. Keys › « + » › Apple Push Notifications service (APNs) › download the `.p8` key, note its Key ID. Then:
   `npx wrangler pages secret put APNS_KEY --project-name observatoire-cn` (paste the .p8 file's whole text),
   `APNS_KEY_ID` (the key's id), `APNS_TEAM_ID` (the Team ID), `OZITRAC_APNS_TOPIC` (`com.ozimut.ozitrac`).
4. App Store Connect (appstoreconnect.apple.com) › Users and Access › Integrations › App Store Connect API › generate a key
   (role App Manager): note the Issuer ID and Key ID, download the `.p8`. GitHub secrets `APPLE_TEAM_ID`,
   `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY` (the .p8's text).
5. App Store Connect › Apps › « + » › New App: iOS, name « Ozitrac », bundle `com.ozimut.ozitrac`.
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
2. Make the release keystore **once, kept for good**: `keytool -genkeypair -v -keystore ozitrac-release.jks -alias ozitrac
   -keyalg RSA -keysize 4096 -validity 10000` (keytool comes with any Java; or Android Studio › Build › Generate Signed
   Bundle). Keep it in `data\secrets`.
3. GitHub secrets `ANDROID_KEYSTORE_BASE64` (base64 of the .jks, as in step 4.3), `ANDROID_KEYSTORE_PASSWORD`,
   `ANDROID_KEY_ALIAS` (`ozitrac`), `ANDROID_KEY_PASSWORD`. Ask Claude to add the App Bundle to the workflow.
4. Tell Claude the key's SHA-256 (`keytool -list -v -keystore ozitrac-release.jks`, the « SHA256 » line; or Play Console ›
   App integrity once Play signs): it goes into `site/.well-known/assetlinks.json`, so that `ozimut.com/z/…` and
   `ozimut.com/t/<code>` links open the app.
5. Play Console › a new app « Ozitrac », package `com.ozimut.ozitrac`, free, no ads, no in-app purchase › the « Foreground
   service: location » declaration (a short video of the tracker running with the screen locked) and the data safety form
   (location shared with the followers, encrypted in transit and end to end; no account; the privacy page's « Ozitrac »).
   The target audience: adults (parents set the app up on a child's phone); read Google's Families policy before choosing.
   Nothing in the app may show a price or lead to buying (the study of paid plans).

## 9. Opening to everyone

Ozitrac itself needs no opening: anyone who installs it uses it. For Ozimut's side, when the tests are good:
`TRACK_OPEN = "1"` in `wrangler.toml`, push. Coach › Suivi GPS, its documentation chapter and the year of birth at
registration then appear for every account, and nobody under 15 registers alone.
