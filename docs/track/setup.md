# The apps and the tracking — everything the owner sets up, step by step

Rewritten 2026-11-26. It covers **Folloz** (the tracking app: Android, Wear OS, iPhone, Apple Watch, and its relay — a
repository of its own, https://github.com/kerkia/Folloz, checked out at `C:\Kerkia\Ozimut\Folloz`), **Ozimut's own tracking**
(Coach › « Suivi GPS ») and the shared parts of **the Ozimut app** (`app/`, whose store submission is detailed in
`docs/app/setup.md`). The code is written and built by GitHub Actions; what is left needs your accounts, keys and devices.

**How to read it.** The phases are in order: each one can be tested before the next, and nothing costs money before phase 4.
Every account (Google Play, Apple, Firebase) is made **once** and serves both apps. Where a console's page may have changed
since this was written, the text says « check »: Google and Apple redesign their consoles often, the meaning of each step
rarely.

**Secrets.** Nothing in this file is a secret: secrets are typed into the tools (GitHub's form, wrangler's prompt), never
into this file, a commit or a chat. Every file Apple, Google or Firebase lets you download (keys, keystore, service account)
goes into `C:\Kerkia\Ozimut\data\secrets\` — Kopia backs it up, git never sees it. Several can be downloaded **only once**.
The table at the end lists every secret and where it goes.

**Commands.** Run in PowerShell; each is one line, from any folder. `npx wrangler …` uses the PC's Cloudflare login.

---

## Phase 0 — What is already done (nothing to do; 2 minutes to check)

- **Database**: every D1 migration the tracking and the apps need is applied (0029 tracking, 0030-0031 clubs and entries,
  0032 the app's notification tokens, 0033). Only `0034_billing.sql` is pending, and it belongs to the paid plans, not here:
  **do not run `npx wrangler d1 migrations apply` for this guide** — it would apply 0034 too.
- **Ozimut's live relay** (`ocn-live`): deployed, `TRACK_RELAY_SECRET` set on it and on the site, the site bound to it
  (`LIVE_TRACK`). Alerts of Ozimut's own tracking work.
- **Folloz's relay**: the Worker `folloz`, live on ozimut.com's paths `/api/folloz` and `/z/`, tested against production.
- **Who sees Ozimut's tracking**: administrators and the testers (accounts whose D1 `users.preview` names `track`: Alec and
  Nadejda), while `TRACK_OPEN` is "0" in `wrangler.toml`. Folloz itself has no account and no such switch.
- **Missing everywhere**: every push key (Firebase, Apple). Without them the apps work, but alerts show only while the app
  is open.

To check what is set, at any time:

```powershell
cd C:\Kerkia\Ozimut\Ozimut; npx wrangler pages secret list --project-name observatoire-cn
```

```powershell
cd C:\Kerkia\Ozimut\Folloz\server; npx wrangler secret list
```

GitHub's secrets (names only): github.com/kerkia/Folloz › Settings › Secrets and variables › Actions, and the same page
on github.com/kerkia/Ozimut.

A quick live check: on ozimut.com, signed in as administrator, Coach › « Suivi GPS » opens without an error.

---

## Phase 1 — Android phones, no account, no cost (about an hour, two Android phones)

The point: try both apps on real phones before paying anything or waiting on Apple. Debug builds only; notifications come
in phase 2.

### 1.1 Folloz on two phones

1. github.com/kerkia/Folloz › **Actions** › **android** › the latest green run › **Artifacts** › `folloz-android-apks`
   (a zip). Inside: `debug/app-debug.apk` (the `release` one is unsigned and does not install).
2. Copy `app-debug.apk` to the first phone (USB, an e-mail to yourself, a cloud drive) and open it. Android asks to allow
   installing apps from that source: allow it for that one app (Files, Gmail…). Do the same on the second phone.
   - **Each CI run signs its debug APK with a new key**: to install a newer build, uninstall the old one first.
   - An app named « Ozimut » installed before 2026-11-23 with the package `com.ozimut.app` but tracking inside is the old
     build of the tracker: uninstall it.
3. Open Folloz on both: it asks a first name. No account, no sign-in.
4. **Being followed** (phone A): « Ma course » › « Qui me suit » › « Ajouter quelqu'un »: a QR code. **Following** (phone
   B): « Je suis » › « Scanner un code », scan it. Phone A now lists phone B's first name.
5. Phone A: « Test de deux minutes ». Lock the screen, put the phone in a pocket, wait. If it fails, the app names the
   battery setting of this phone's maker and opens it: change it, test again. **Note the maker and model and whether it
   passed** (Samsung, Xiaomi, Huawei, OnePlus are the usual troublemakers).
6. Phone A: « Démarrer une course » › Direct, walk outside 10 minutes, stop by holding « Arrêter » two seconds. On phone B,
   the person's map shows the trail live (about 15 s behind while the map is open). Phone A's « Mes courses » keeps the
   run: share it as GPX.
7. Again with « Course longue » (a fix every 30 s, sent every 5 min), « Mes suiveurs peuvent passer en direct » ticked.
   On phone B, « Passer en direct » › 5 min: phone A switches within seconds while it is awake, else at its next batch
   (without Firebase it cannot be woken — phase 2).
8. « J'ai besoin d'aide » (held): phone B shows it on the map at once.
9. **Linking to Ozimut**: on ozimut.com › Coach › Suivi GPS › « Famille et appareils » › yourself (or a test child) ›
   « Associer un téléphone »: a QR code and 8 characters. On phone A: « Relier à Ozimut », scan or type it. From then on
   every run also goes to that account: run again, then see it in « Suivre » (live) and « Mes traces » (afterwards).

### 1.2 Folloz on a Wear OS watch (optional, about 30 minutes)

A Wear OS watch with LTE (Galaxy Watch 4 or later in LTE, Pixel Watch LTE…) tracks alone; on Wi-Fi it is enough to test.

1. Same run's artifacts › `folloz-wearos-apks` › `debug/wear-debug.apk`. **Take the phone's and the watch's APKs from the
   same run**: the watch hands its runs to the phone only between apps signed with the same key.
2. On the PC, once: `winget install Google.PlatformTools`, then open a new PowerShell.
3. On the watch: Settings › System › About › « Build number » (Samsung: « Software information » › « Software version »)
   tapped seven times; then Settings › Developer options › « ADB debugging » and « Wireless debugging » on (watch and PC on
   the same Wi-Fi). « Wireless debugging » › « Pair new device » shows an address and a code.
4. On the PC, with what the watch shows:

   ```powershell
   adb pair <address:port> <code>
   ```

   ```powershell
   adb connect <address:port of « Wireless debugging »>
   ```

   ```powershell
   adb install C:\Users\<you>\Downloads\folloz-wearos-apks\debug\wear-debug.apk
   ```

5. On the watch, Folloz: « Qui me suit » shows a QR code that phone B scans; « Démarrer » (allow the location), walk,
   watch it live on phone B. Turn the paired phone's Bluetooth off to make the watch use its own network.
6. Once the run has ended and the phone is near again (Bluetooth on), the run appears in the phone's Folloz › « Mes
   courses », marked « Enregistrée sur la montre ».

### 1.3 The Ozimut app (15 minutes)

1. github.com/kerkia/Ozimut › Actions › **app-android** › the latest green run › Artifacts › `ozimut-app-apk` ›
   `debug/app-debug.apk`. Install it as above (it is another app, `com.ozimut.app`: Folloz stays).
2. Test as `docs/app/setup.md` step 6 says (sign in, « Entrer sans compte », nothing about buying, a GPX shared to it, the
   map scanner). Health routes are iPhone only.

### 1.4 Optional: Ozimut's tracking with Traccar Client (15 minutes)

A free third-party tracker, to test Ozimut's own tracking without Folloz: Coach › Suivi GPS › « Famille et appareils » ›
« + Ajouter un enfant » (a test child) › « Traccar Client pour <prénom> » shows a QR code. Install « Traccar Client » (Play
Store), **in Traccar Client** open its settings and tap the QR icon at the top, scan the computer's code (not with the
phone's camera), turn the service on, walk. Coach › Suivi GPS › « Suivre » › the child shows the track; stop the service:
the alert « plus de position » comes after 3 minutes.

**Report** what failed (a screenshot, the phone model) before going on: fixes are cheaper now than after the stores.

---

## Phase 2 — Firebase: notifications on Android (about 30 minutes, free)

One Firebase project serves both Android apps (the server has one service account for all of them). Firebase is **only
used to deliver notifications** to Android: no analytics, no other Firebase product.

### 2.1 The project and the two Android apps

1. console.firebase.google.com › sign in with the Google account that will own the apps (the same as Google Play later is
   simplest) › « Create a project » › name `Ozimut` › **Google Analytics: off** (not needed) › Create.
2. Project overview › « Add app » › the Android icon:
   - Package name: **`com.ozimut.folloz`** (exactly). Nickname: `Folloz`. No SHA-1. › Register app.
   - It offers `google-services.json`: download it, then **skip the remaining steps** (the SDK is already in the code).
3. Project overview › « Add app » › Android again: package **`com.ozimut.app`**, nickname `Ozimut` › Register › skip.
4. Project settings (the gear) › General › « Your apps »: both are listed. Download `google-services.json` **again now**
   (the button under either app): this file holds both apps. Save it as
   `C:\Kerkia\Ozimut\data\secrets\google-services.json` (replacing the first download).
5. Project settings › **Cloud Messaging**: « Firebase Cloud Messaging API (V1) » must say **Enabled**. (The « Legacy » API
   is not used.)
6. The Wear OS app needs no Firebase: the watch is never notified, it is followed.

### 2.2 The file to both build workflows

The same file, in base64, under two names (one per repository):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Kerkia\Ozimut\data\secrets\google-services.json")) | Set-Clipboard
```

1. github.com/kerkia/**Folloz** › Settings › Secrets and variables › Actions › « New repository secret » › Name
   **`GOOGLE_SERVICES_JSON`** › paste › Add secret.
2. github.com/kerkia/**Ozimut** › the same page › Name **`APP_GOOGLE_SERVICES_JSON`** › paste › Add secret.

### 2.3 The service account to both servers

1. Firebase › Project settings › **Service accounts** › « Generate new private key » › Generate key: a JSON file. Save it as
   `C:\Kerkia\Ozimut\data\secrets\firebase-service-account.json`. **It is a full credential**: never anywhere else.
2. To Folloz's relay (alerts to the people following; takes effect at once):

   ```powershell
   cd C:\Kerkia\Ozimut\Folloz\server; Get-Content -Raw C:\Kerkia\Ozimut\data\secrets\firebase-service-account.json | npx wrangler secret put FCM_SERVICE_ACCOUNT
   ```

3. To the site (Ozimut's tracking alerts to a linked phone, and every notification of the Ozimut app; takes effect at the
   next deploy):

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; Get-Content -Raw C:\Kerkia\Ozimut\data\secrets\firebase-service-account.json | npx wrangler pages secret put FCM_SERVICE_ACCOUNT --project-name observatoire-cn
   ```

4. Ask Claude to start a deploy of the site (or push anything under `site/`), so that the Pages secret is used.

### 2.4 New builds, then test

1. github.com/kerkia/Folloz › Actions › **android** › « Run workflow » › main › Run. Its log says « Built with notifications
   (FCM) ». Same on github.com/kerkia/Ozimut › Actions › **app-android**.
2. Uninstall and reinstall both debug APKs (phase 1). Folloz asks for notifications the first time it follows someone:
   allow.
3. Test on phone B (following): phone A starts a run (« start » alert), holds Help (« help »), then stays without network
   3 minutes in Direct — airplane mode — (« silent », sent by the relay itself). With phone B's app **closed**, each one must
   arrive as a notification naming phone A's person.
4. In a long run, phone B's « Passer en direct » now wakes phone A within seconds even with its screen off.
5. The Ozimut app: Réglages › this device › turn notifications on › « Envoyer un essai ».

---

## Phase 3 — One upload key for Android (15 minutes, once, kept for good)

Google Play signs the apps people install with **its own key** (Play App Signing, the default); you sign what you upload
with an **upload key**. One upload key can serve both apps. Lost, it can be replaced through Play's support — still, keep it
safe.

1. A JDK, once (it brings `keytool`), then open a new PowerShell:

   ```powershell
   winget install EclipseAdoptium.Temurin.17.JDK
   ```

2. Make the key (it asks a password — use a long one, store it in your password manager — and a name, which nobody sees):

   ```powershell
   keytool -genkeypair -v -keystore C:\Kerkia\Ozimut\data\secrets\ozimut-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
   ```

3. Copy it as base64:

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Kerkia\Ozimut\data\secrets\ozimut-upload.jks")) | Set-Clipboard
   ```

4. Four secrets **in each repository** (github.com/kerkia/Folloz and github.com/kerkia/Ozimut › Settings › Secrets and
   variables › Actions):

   | Name | Value |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | the clipboard (base64 of the .jks) |
   | `ANDROID_KEYSTORE_PASSWORD` | the password typed |
   | `ANDROID_KEY_ALIAS` | `upload` |
   | `ANDROID_KEY_PASSWORD` | the same password (keytool uses one for both unless you gave two) |

5. Run « android » (Folloz) and « app-android » (Ozimut) again: the runs now also keep **`folloz-aab`** (the phone's and the
   watch's bundles) and **`ozimut-app-aab`** — what Google Play takes. From now on every build is signed with this key, so
   **a newer APK installs over an older one** (uninstall the old debug build once).
6. Note the key's fingerprint (for phase 4.6):

   ```powershell
   keytool -list -v -keystore C:\Kerkia\Ozimut\data\secrets\ozimut-upload.jks -alias upload
   ```

   The line « SHA256: AB:CD:… ».

---

## Phase 4 — Google Play (an hour of forms, then 14 days of closed testing, then Google's review)

### 4.1 The developer account (25 USD once; a few days of verification)

1. play.google.com/console › sign in with the Google account (the Firebase one is simplest) › « Create a developer account ».
2. **Personal or organisation** — it decides the developer name shown on Play and cannot simply be switched later:
   - **Personal**: your legal name and address (the address is not shown publicly for a personal account that does not
     sell; check the current rule on Google's page « Developer account information »), a phone and contact e-mail
     verified, an identity document. **New personal accounts must run a closed test with at least 12 testers opted in
     for at least 14 continuous days before each app can go to production** (support.google.com/googleplay/android-developer/answer/14151465;
     checked 2026-11-23).
   - **Organisation**: a legal entity, its **D-U-N-S number** (free from Dun & Bradstreet, days to weeks), a website and
     e-mail on its domain. No 12-tester rule. Ozimut has no legal entity today: **personal** is the realistic choice.
3. Pay the 25 USD, then follow the verification steps the console shows: identity, contact phone, and for personal accounts
   **access to a real Android device** through the « Google Play Console » app (check: the console says what it asks).
4. **Android developer verification** (Google's rule for apps installed outside Play, from September 2026 in a few
   countries, everywhere in 2027): a Play Console account is already verified for it; sideloaded debug builds of your own
   apps keep working for testing (check Google's « Android developer verification » page when it applies in France).

### 4.2 Two apps in the console

For each (« Create app »):

| | Folloz | Ozimut |
|---|---|---|
| App name | `Folloz` | `Ozimut` |
| Default language | French (France) | French (France) |
| App or game | App | App |
| Free or paid | **Free** (cannot become paid later) | **Free** |
| Package (set by the first upload) | `com.ozimut.folloz` | `com.ozimut.app` |

Tick the declarations (developer programme policies, US export laws) › Create app.

### 4.3 Folloz's « App content » (Policy › App content)

Answer each form; the facts are those of Folloz's `PRIVACY.md` and `docs/design.md`:

- **Privacy policy**: `https://github.com/kerkia/Folloz/blob/main/PRIVACY.md` (public, no sign-in).
- **App access**: « All functionality is available without special access » — Folloz has no account. In the instructions
  field: « No account. To try following, install the app on two devices: on one, Ma course › Qui me suit › Ajouter
  quelqu'un shows a code; on the other, Je suis › Scanner un code. »
- **Ads**: no ads.
- **Content rating**: the IARC questionnaire — category « Utility, productivity, communication or other »; *shares the
  user's location with other users*: **yes** (that is the app's purpose); no violence, no user chat, no purchases.
- **Target audience and content**: **18 and older** (parents install it on a child's phone and manage it; choosing an
  audience under 13 brings Google's Families policy — read it before choosing otherwise).
- **Data safety**:
  - *Does your app collect or share any of the required user data types?* **Yes** (positions linked to Ozimut, push tokens).
  - **Location › Precise location**: collected — **only** when the phone is linked to an Ozimut account (« Relier à
    Ozimut »): purpose App functionality, linked to the user, optional. Positions sent to the relay are **end-to-end
    encrypted** (the relay cannot read them): Google does not count end-to-end encrypted data as collected (check the
    form's help, « end-to-end encryption »).
  - **App info and performance**: none. **Device or other IDs**: the notification token (App functionality, not linked).
  - What the relay sees in clear (battery level, alert kinds, times) has no category of its own: « App activity › Other
    actions » if you want to be exhaustive (App functionality, not linked).
  - Shared with third parties: **none** (Cloudflare and Google's FCM are service providers). Encrypted in transit: **yes**.
    Users can request deletion: **yes** (« Ma course » › « Mes données » › « Effacer mes données » removes everything the
    relay holds for that phone).
- **Foreground service permissions** (the app uses `FOREGROUND_SERVICE_LOCATION`): declare « Location » › the use:
  « Live tracking of a run the user starts, shown to the people the user chose; the service runs only between Start and
  Stop » › **a short video** (30-60 s, uploaded to YouTube as unlisted): start a run, lock the screen, the notification
  that tracking is on, the follower's map moving, Stop.
- **Location permissions**: the app asks only « while in use » (no background location permission): no background location
  declaration. If the console still asks, answer that the foreground service is used and attach the same video.
- **Health apps**: none (Folloz records positions, not health data; tick nothing, or « Activity and fitness » only if the
  form insists; check the form's list).
- **Account deletion**: the app has no account: answer that users cannot create an account in the app.
- **Government apps, financial features, news**: no.

### 4.4 Ozimut's « App content »

As `docs/app/setup.md` step 12.4 says (privacy policy `https://ozimut.com/#/compte/confidentialite`, a review account, data
safety, no account creation in the app).

### 4.5 Store listings

- Folloz: name, short description (80 characters), full description, icon 512 × 512 (the mark: drawn by Folloz's
  `tools/make_icons.py` at 1024 px — ask Claude for a 512 px PNG), a feature graphic 1024 × 500, at least 2 phone
  screenshots, and for the watch **Wear OS screenshots** (square or round, as the console asks). Texts in French, English,
  German, Spanish — ask Claude to write them in a `docs/store.md` of the Folloz repository, as `docs/app/store.md` for Ozimut.
  **Screenshots only with invented names and places** (two test phones, a walk you do not mind showing — or ask Claude for
  pictures made on invented data).
- Ozimut: `docs/app/store.md`.

### 4.6 App Links (Folloz's codes open the app)

`https://ozimut.com/z/…` (a Folloz code) and `/t/…` (an Ozimut pair code) open Folloz directly only when
`site/.well-known/assetlinks.json` names **the key the installed app is signed with**:

1. After the first upload (4.7), Play Console › Folloz › Test and release › Setup › **App integrity** › « App signing » tab:
   copy the **App signing key certificate**'s SHA-256 (Google's key: what Play users get).
2. Send Claude both fingerprints — that one and your upload key's (phase 3.6, for builds installed by hand). Claude puts
   them in Ozimut's `site/.well-known/assetlinks.json` and pushes.
3. Debug builds from CI (a new key each run) never verify: their links open a chooser or the browser page — expected.

### 4.7 Closed testing — 12 testers, 14 days, both apps at once

1. A Google Group of testers is simplest: groups.google.com › Create group (e.g. `ozimut-testers`), add at least **12** people
   with Google accounts (club members, family). More than 12 is safer: someone leaving resets nothing, but fewer than 12
   opted in for 14 days does.
2. Play Console › each app › Test and release › Testing › **Closed testing** › Create track (or use « Alpha ») › Testers:
   the group's address › Save.
3. Create release › upload:
   - Folloz: from the **android** run's `folloz-aab`, the phone's `app-release.aab`. The **watch** needs Wear OS enabled
     first: Test and release › Advanced settings › **Form factors** › « + Add form factor » › Wear OS, accept, then a
     **Wear OS** closed-testing track, upload `wear-release.aab` there (same package; its version code is 300 000 000 + the
     run's number, so the two never collide). Check the console's current wording.
   - Ozimut: `ozimut-app-aab` from **app-android**.
   - Release notes › Next › Save › « Send for review » (Google reviews even closed tests; hours to days).
4. Each tester opens the opt-in link (Testers › « Copy link »), accepts, installs from Play. **Count 14 days from the day
   the twelfth tester opted in.** Ask them to really use the apps (Google asks about it).
5. Each new build: run the workflow, upload the new `.aab` to the same track (version codes always rise: they are the run's
   number).

### 4.8 Production

After 14 days: Dashboard › **Apply for production** (questions: who tested, how, what you changed). Once granted:
Production › Create release › the tested `.aab` (and the Wear OS one in its Wear OS production track) › countries › send for
review (days). Before each Ozimut release: the crawl of `docs/app/setup.md` step 7.

---

## Phase 5 — Apple (99 USD a year; days of enrolment, then Apple's reviews)

There is no Mac: **GitHub Actions builds, signs and uploads** both apps (Folloz's **ios** workflow, Ozimut's **app-ios**),
with an App Store Connect API key. You need an iPhone (iOS 17 or later) and, for the watch, an Apple Watch paired with it.

### 5.1 The Apple Developer Program

As `docs/app/setup.md` step 1 (read it: individual or organisation, the EU trader status). In short: developer.apple.com ›
Account › « Enroll » with your Apple Account (two-factor on), **individual**, your legal name, 99 USD a year, a few days. Then
developer.apple.com › Account › **Membership details**: note the **Team ID** (10 characters). App Store Connect › Business:
accept the agreements shown (a free app needs no paid-apps agreement).

### 5.2 Identifiers (15 minutes)

developer.apple.com › Account › **Certificates, Identifiers & Profiles** › Identifiers › « + »:

1. **App Groups** › Continue › Description `Folloz`, Identifier **`group.com.ozimut.folloz`** › Register. (Folloz's iPhone
   app shares the names of the people followed with its notification extension through it.)
2. **App IDs** › App › Continue, five times — Bundle ID **Explicit**, and **exactly** these capabilities:

   | Description | Bundle ID | Capabilities |
   |---|---|---|
   | Folloz | `com.ozimut.folloz` | Associated Domains, Push Notifications, App Groups (configure: `group.com.ozimut.folloz`) |
   | Folloz notifications | `com.ozimut.folloz.notify` | App Groups (the same group) |
   | Folloz Live Activity | `com.ozimut.folloz.widget` | none |
   | Folloz watch | `com.ozimut.folloz.watchkitapp` | HealthKit |
   | Ozimut | `com.ozimut.app` | Push Notifications, HealthKit |

   Under HealthKit leave « Clinical Health Records » and « Background Delivery » unticked; under Push Notifications ignore
   « Configure » (certificates): the servers use a key (5.3). No certificate or profile to make by hand: the workflows'
   automatic signing creates them.

### 5.3 The APNs key — notifications (15 minutes)

One key serves every app of the team.

1. Certificates, Identifiers & Profiles › **Keys** › « + » › Name `Ozimut APNs` › tick **Apple Push Notifications service
   (APNs)** › if asked: environment **Sandbox & Production**, scope **Team scoped (all topics)** › Continue › Register ›
   **Download** `AuthKey_<KEYID>.p8` — **only once** — into `C:\Kerkia\Ozimut\data\secrets\`. Note the **Key ID**.
2. To Folloz's relay (replace `<KEYID>`; the two others ask for the value):

   ```powershell
   cd C:\Kerkia\Ozimut\Folloz\server; Get-Content -Raw C:\Kerkia\Ozimut\data\secrets\AuthKey_<KEYID>.p8 | npx wrangler secret put APNS_KEY
   ```

   ```powershell
   cd C:\Kerkia\Ozimut\Folloz\server; npx wrangler secret put APNS_KEY_ID
   ```

   ```powershell
   cd C:\Kerkia\Ozimut\Folloz\server; npx wrangler secret put APNS_TEAM_ID
   ```

   (the Key ID, then the Team ID). The relay sends under `com.ozimut.folloz` by default.
3. To the site:

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; Get-Content -Raw C:\Kerkia\Ozimut\data\secrets\AuthKey_<KEYID>.p8 | npx wrangler pages secret put APNS_KEY --project-name observatoire-cn
   ```

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; npx wrangler pages secret put APNS_KEY_ID --project-name observatoire-cn
   ```

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; npx wrangler pages secret put APNS_TEAM_ID --project-name observatoire-cn
   ```

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; npx wrangler pages secret put APNS_TOPIC --project-name observatoire-cn
   ```

   (type `com.ozimut.app`)

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; npx wrangler pages secret put FOLLOZ_APNS_TOPIC --project-name observatoire-cn
   ```

   (type `com.ozimut.folloz`: Ozimut's tracking alerts to a Folloz iPhone linked to an account). Then ask Claude to start a
   deploy of the site.

### 5.4 The App Store Connect API key — what lets GitHub sign and upload (10 minutes)

1. appstoreconnect.apple.com › **Users and Access** › **Integrations** › App Store Connect API › **Team Keys** (the first
   time: « Request Access », accept).
2. « Generate API Key » › Name `GitHub CI` › Access **Admin** (Xcode's automatic signing creates the certificate and the
   profiles in Apple's cloud; lower roles are refused there) › Generate. Note the **Issuer ID** (top of the page) and the
   **Key ID** › **Download** `AuthKey_<KEYID>.p8` — once only — into `data\secrets` (it is not the APNs key).
3. Four secrets **in each repository** (github.com/kerkia/Folloz and github.com/kerkia/Ozimut › Settings › Secrets and
   variables › Actions):

   | Name | Value |
   |---|---|
   | `APPLE_TEAM_ID` | the Team ID |
   | `APP_STORE_CONNECT_KEY_ID` | the API key's Key ID |
   | `APP_STORE_CONNECT_ISSUER_ID` | the Issuer ID |
   | `APP_STORE_CONNECT_KEY` | the `.p8` file's whole text |

   ```powershell
   Get-Content -Raw C:\Kerkia\Ozimut\data\secrets\AuthKey_<KEYID>.p8 | Set-Clipboard
   ```

   An Admin key can manage the whole team: it lives only there and in `data\secrets`. If it ever leaks, revoke it on the
   same page and make another.

### 5.5 Universal links (Folloz's codes open the app)

Send Claude the **Team ID**: it replaces `TEAMID0000` in Ozimut's `site/.well-known/apple-app-site-association` (Folloz's
`/z/*` and `/t/*` links, and the Ozimut app's saved passwords) and pushes. Not a secret.

### 5.6 The app records and the first TestFlight builds (30 minutes, then Apple's processing)

1. App Store Connect › **Apps** › « + » › **New App**, twice:
   - Folloz: Platform **iOS**, Name `Folloz` (unique on the whole App Store; if taken, e.g. « Folloz – live tracking »; the
     name under the icon stays « Folloz »), Primary language French (France), Bundle ID `com.ozimut.folloz`, SKU
     `folloz-ios`, Full Access. The Apple Watch app goes with it (it is embedded).
   - Ozimut: as `docs/app/setup.md` step 5.1.
2. github.com/kerkia/Folloz › Actions › **ios** › « Run workflow » › main › tick **« Archive, sign and upload to
   TestFlight »** › Run. The `build` job (simulators, tests) runs first, then `release` (20-40 minutes). A missing secret is
   named in a warning and nothing is uploaded; a signing error shows as an annotation: send it to Claude.
   Same for Ozimut: github.com/kerkia/Ozimut › Actions › **app-ios** › the same box.
3. App Store Connect › the app › **TestFlight**: the build appears « Processing », then ready (minutes to an hour).
   **Export compliance**: Folloz encrypts the positions end to end with the system's own CryptoKit (AES-GCM); its
   `project.yml` declares no non-exempt encryption. If App Store Connect asks, read Apple's « Complying with encryption
   export regulations » before answering; for France, an app supplying end-to-end encryption may need a declaration to the
   ANSSI unless an exemption applies — **check with ANSSI's page « Déclaration ou demande d'autorisation de moyens de
   cryptologie » before the first public release** (not needed for TestFlight with your own testers).
4. TestFlight › Internal Testing › « + » › group `Owner` › add yourself › automatic distribution on › add the build.
5. On the iPhone: install **TestFlight** (App Store), sign in with the same Apple Account, open the invitation › Install.
   Builds expire after 90 days.

### 5.7 What to test on the iPhone and the watch (an hour or two)

**Folloz** (two phones: two iPhones, or an iPhone and an Android phone from phase 1):

1. First name; « Test de deux minutes » with the screen locked.
2. Being followed and following, as phase 1.1 steps 4-8; a code sent as a link (Messages) opens the app directly (needs
   5.5). Notifications with the app closed: start, help, silent; a long run woken by « Passer en direct ».
3. The Live Activity on the lock screen during a run.
4. **The watch**: Folloz on the Apple Watch › « Démarrer » (allow location and Health), its code shown as a QR code scanned by
   a phone, a run followed; once ended, the run arriving in the iPhone's « Mes courses » (« Enregistrée sur la montre »).
   A cellular watch: leave the iPhone at home.
5. « Relier à Ozimut » with an Ozimut pair code.

**Ozimut**: `docs/app/setup.md` step 6.

### 5.8 Submitting Folloz to the App Store (two hours the first time; review usually a day or two)

1. App Store Connect › Folloz › **App Information**: subtitle; category **Navigation** or **Sports** (secondary: the other);
   Content Rights: no third-party content (the map tiles are drawn by the providers named in the credits — answer « yes,
   I have the rights », the providers' licences allow it); Age Rating questionnaire: no objectionable content; *shares
   location with others*: answer what Apple's current questions ask (Folloz shares it only with people the user chose).
   **Privacy Policy URL**: `https://github.com/kerkia/Folloz/blob/main/PRIVACY.md`.
2. **Pricing and Availability**: Free; countries. The **EU trader** question (`docs/app/setup.md` step 1.6).
3. **App Privacy** › Get Started: *collect data?* **Yes**; *tracking?* **No**. Types (App Functionality):
   - **Location › Precise Location** — linked to the user — **only for phones linked to an Ozimut account**; what goes to
     the relay is end-to-end encrypted, unreadable by the developer (say so in the review notes; Apple counts as collected
     what the developer can access — check its definitions).
   - **Identifiers › Device ID** — not linked — the notification token.
   - **Diagnostics › Other Diagnostic Data** — not linked — the battery level and alert kinds the relay sees.
4. **The version**: screenshots (iPhone 6.9″ and, for the watch, Apple Watch screenshots — App Store Connect lists the
   sizes; invented names only), description (in four languages: ask Claude, as for Play), keywords, support URL
   `https://github.com/kerkia/Folloz` (public), the build tested, copyright « 2026 Yann Le Helloco », release « Manually ».
5. **App Review Information**: no sign-in (Folloz has no account). Notes, in English:

   > Folloz is a free live GPS tracking app between phones, with no account and nothing sold. A runner's phone shows a
   > code; the people who scan it follow the run live. Positions are encrypted end to end on the runner's phone for each
   > follower (AES-GCM, CryptoKit): our relay stores only sealed data. Location is used only between Start and Stop, with
   > « while in use » permission and the location background mode, as the user sees in the Live Activity. The Apple Watch
   > app records a run as an HKWorkoutSession so that tracking continues wrist down, and saves the workout to Health.
   > To try following, two devices are needed; a screen recording is attached.

   Attach a 1-2 minute screen recording of both phones (invented first names).
6. « Add for Review » › « Submit for Review ». Answers come in the **Resolution Center**. Likely questions: background
   location (point to the notes: only during a run the user starts, the Live Activity shows it) and HealthKit (the watch's
   workout session).

### 5.9 The Ozimut app

`docs/app/setup.md` steps 5 to 8 (its record, TestFlight, tests, App Privacy, review account, the replies to 3.1.x and 4.2).

---

## Phase 6 — Map tiles for Folloz, before the public release (about 15 minutes; free tier)

Folloz draws OpenStreetMap's own tiles outside France and Switzerland. OpenStreetMap's tile policy allows that only for light
use: before publishing, take a provider with a free tier — **MapTiler** (maptiler.com, raster « Outdoor » or « Streets »),
Stadia Maps or Thunderforest:

1. Create the account, then a key **restricted** to the apps if the provider allows it (MapTiler: « Allowed HTTP origins » or
   a user-agent rule containing `Folloz`).
2. Send Claude the tile address it gives (`https://…/{z}/{x}/{y}.png?key=…`) and the credit it asks for (e.g.
   « © MapTiler © OpenStreetMap contributors »). Claude puts them in Folloz's relay (as a Worker secret if the key must stay
   private) and deploys it. No new app build: the apps read the list from `/api/folloz/config`.

---

## Phase 7 — Optional

### 7.1 Polar (15 minutes)

1. admin.polaraccesslink.com › sign in with a Polar account › create a client: redirect URL
   `https://ozimut.com/api/track/polar/callback`. Note the client id and secret.
2. Ask Claude for the one command that creates the webhook (event EXERCISE, URL `https://ozimut.com/api/track/polar/webhook`)
   with the client id and secret; note its signature secret.
3. Pages secrets `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET`, `POLAR_WEBHOOK_SECRET`:

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; npx wrangler pages secret put POLAR_CLIENT_ID --project-name observatoire-cn
   ```

   (and the two others the same way), then a deploy.
4. Coach › Suivi GPS › « Mes traces » › « Relier Polar ».

### 7.2 The Garmin data field — set aside (2026-11-23)

A Garmin watch sends only through its phone, which can then track by itself with Folloz. The code stays in `track/garmin`;
nothing on the site offers it. If it is taken up again: `track/garmin/README.md` (a Garmin developer account, a developer key
kept for good, a private beta on the Connect IQ store).

---

## Phase 8 — Opening Ozimut's tracking to everyone

Folloz needs no opening: anyone who installs it uses it. For Ozimut's side, when the tests are good: ask Claude to set
`TRACK_OPEN = "1"` in `wrangler.toml` and push. Coach › Suivi GPS, its documentation chapter and the year of birth at
registration then appear for every account, and nobody under 15 registers alone. To let one more person test before that:

```powershell
cd C:\Kerkia\Ozimut\Ozimut; npx wrangler d1 execute ocn --remote --command "SELECT id, email, preview FROM users WHERE email = '<their e-mail>'"
```

then (keeping any feature already in `preview`, separated by a comma):

```powershell
cd C:\Kerkia\Ozimut\Ozimut; npx wrangler d1 execute ocn --remote --command "UPDATE users SET preview = 'track' WHERE id = <id>"
```

---

## Every secret and where it goes

| Secret | Where | What | Phase |
|---|---|---|---|
| `GOOGLE_SERVICES_JSON` | GitHub **kerkia/Folloz** | `google-services.json` in base64 | 2.2 |
| `APP_GOOGLE_SERVICES_JSON` | GitHub **kerkia/Ozimut** | the same file in base64 | 2.2 |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | GitHub, **both** repositories | the upload key, its password, `upload` | 3 |
| `APPLE_TEAM_ID`, `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY` | GitHub, **both** repositories | Team ID; the API key (Admin) | 5.4 |
| `FCM_SERVICE_ACCOUNT` | Folloz's Worker **and** Cloudflare Pages | Firebase's service account JSON | 2.3 |
| `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID` | Folloz's Worker **and** Cloudflare Pages | the APNs `.p8` text, its Key ID, the Team ID | 5.3 |
| `APNS_TOPIC` | Cloudflare Pages | `com.ozimut.app` | 5.3 |
| `FOLLOZ_APNS_TOPIC` | Cloudflare Pages | `com.ozimut.folloz` | 5.3 |
| `POLAR_CLIENT_ID`, `POLAR_CLIENT_SECRET`, `POLAR_WEBHOOK_SECRET` | Cloudflare Pages | Polar AccessLink | 7.1 |
| `TRACK_RELAY_SECRET` | Pages and `ocn-live` | done (2026-11-23) | 0 |

- **GitHub**: github.com/kerkia/<repository> › Settings › Secrets and variables › Actions › « New repository secret ».
- **Folloz's Worker**: `cd C:\Kerkia\Ozimut\Folloz\server; npx wrangler secret put <NAME>` — effective at once.
- **Cloudflare Pages**: `cd C:\Kerkia\Ozimut\Ozimut; npx wrangler pages secret put <NAME> --project-name observatoire-cn` —
  effective at the next deploy of the site.

**Files to keep in `C:\Kerkia\Ozimut\data\secrets\`**: `google-services.json`, `firebase-service-account.json`,
`ozimut-upload.jks` (and its password in your password manager), the APNs `AuthKey_<KEYID>.p8`, the App Store Connect
`AuthKey_<KEYID>.p8`.

## Never tried on a real device (2026-11-26)

Everything above has only been compiled and unit-tested by the workflows: the apps on any phone or watch, notifications end
to end (FCM, and APNs over HTTP/2 from a Worker), a long run's battery saving (Doze, makers' battery managers, a phone woken
by a quiet push), the watch handing its runs to the phone, App Links and universal links, the signing and upload jobs with
real secrets, and the stores' reading of both apps.
