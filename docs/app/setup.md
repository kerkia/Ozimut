# The Ozimut app — what the owner does, step by step

Written 2026-11-23. The two shells are written (`app/android`, `app/ios`), the site and the server know the app
(`docs/app/design.md`, the contract); what is left needs the owner's accounts, keys and phones. There is no Mac and no JDK on
the PC: **GitHub Actions builds both apps** (`.github/workflows/app-android.yml`, `app-ios.yml`, repository `kerkia/Ozimut`).

Nothing here is a secret: the secrets are typed into the tools (GitHub's form, wrangler's prompt), never into this file, a
commit or a chat. Keep the files Apple and Google let you download **once** (the `.p8` keys, the keystore, the service
account) in `C:\Kerkia\Ozimut\data\secrets\` — Kopia backs it up, git never sees it.

**Order.** Step 0 first (the server). Then **step 9, the Android app on your phone in 15 minutes**: it tests the site in the
app, the bridge and the files before anything costs money or waits on Apple. Then Apple, steps 1 to 8 (start step 1 early:
enrolment takes days). Then Google Play, steps 10 to 13.

Where a store's page or rule may have changed since this was written, the text says « check » and names Apple's or Google's
own page: their consoles are redesigned often, the meaning of each step rarely.

## Already done for Folloz?

Folloz (`docs/track/setup.md`) needs some of the same things. Whatever you already did there is reused:

| Done for Folloz | For this app |
|---|---|
| Firebase project, `FCM_SERVICE_ACCOUNT` set (its step 5) | Only add an Android app `com.ozimut.app` to **the same** Firebase project (step 10): the server has one service account for both apps. |
| Apple Developer Program, Team ID (its step 6.1) | Skip step 1. |
| APNs key, `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID` (its step 6.3) | One APNs key serves every app of the team: only set `APNS_TOPIC` (step 3). |
| App Store Connect API key and the four GitHub secrets (its step 6.4) | Reused as they are, **if the key's role is Admin** (step 4); Folloz's guide said App Manager, which is not enough here. |
| Release keystore and `ANDROID_KEYSTORE_*` secrets (its step 8) | Reused as they are: both workflows read the same secret names (step 11). |
| Play Console developer account (its step 8.1) | Skip step 10's account part. |

To see which Pages secrets already exist:

```powershell
cd C:\Kerkia\Ozimut\Ozimut; npx wrangler pages secret list --project-name observatoire-cn
```

GitHub's: github.com/kerkia/Ozimut › Settings › Secrets and variables › Actions (names only, never values).

## 0. The server (about 10 minutes, before any device test)

1. The site's side of the app (the in-app pages, `/api/push/native`, the purchase gate) must be committed, pushed and
   deployed. Ask Claude, and check the CI run is green.
2. The D1 migration `0032_app_push.sql` (the table of the app's notification tokens). First list what is pending:

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; npx wrangler d1 migrations list ocn --remote
   ```

   It should name `0032_app_push.sql` (and nothing you do not expect — if 0030 or 0031 are listed too, ask Claude first:
   the command below applies every pending migration in order). Then:

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; npx wrangler d1 migrations apply ocn --remote
   ```

3. Without the migration, `/api/push/native` answers « not ready » and the app simply has no notifications; nothing breaks.

---

# Part I — iPhone (Apple)

## 1. The Apple Developer Program (30 minutes of forms, then days of waiting)

Apple's page: developer.apple.com/programs/enroll (read it the day you enrol; checked 2026-11-23).

1. **Individual or organisation** — the choice decides the seller's name shown under the app on the App Store, and cannot
   simply be switched later (Apple's support can migrate an individual account to an organisation; check).
   - **Individual**: you, 18 or older, your Apple Account with two-factor authentication, your **legal first and last name**
     (no nickname or brand: it delays approval), address, phone. No D-U-N-S number, no website needed. **The App Store shows
     your own legal name as the seller.** Usually approved within a few days.
   - **Organisation**: needs a **legal entity** (an association loi 1901, a company; not a trade name), its **D-U-N-S number**
     (nine digits, free from Dun & Bradstreet through Apple's lookup on that page; getting one can take days or weeks), a
     website on the entity's domain and a work e-mail on that domain, and you must have authority to bind the entity. **The
     App Store shows the entity's legal name.** Longer: Apple may phone to verify.
   - Ozimut has no legal entity today (the rules page names a person as publisher): **individual** is the realistic choice. If
     a seller's name other than yours matters, create the entity first.
2. **Cost**: 99 USD a year (shown in euros when paying). Free for some non-profits and schools on request (check; an
   association could qualify).
3. Enrol: developer.apple.com › Account › sign in with your Apple Account › « Enroll ». On an iPhone, the **Apple Developer**
   app may offer enrolment with an ID scan, which is often quicker (check whether it is offered in France).
4. When accepted: developer.apple.com › Account › **Membership details**: note the **Team ID** (ten characters). It is not a
   secret, but it goes in a secret (`APPLE_TEAM_ID`) and in `APNS_TEAM_ID`.
5. App Store Connect (appstoreconnect.apple.com) › Business: accept the agreements shown. A free app needs no paid-apps
   agreement, tax form or bank account.
6. **EU trader status** (Digital Services Act): App Store Connect asks it before the first submission. A trader's address,
   phone and e-mail are **shown publicly** on the App Store in the EU; without a status, an app is removed from the EU store.
   Whether you are a « trader » is a legal question (an app that earns nothing, from someone with no commercial activity, is
   usually not; paid features on the website later may change that). Read Apple's page « Manage European Union Digital
   Services Act trader requirements » in App Store Connect Help before answering; it can be changed later (Business ›
   Agreements › Compliance).

## 2. The App ID `com.ozimut.app` (5 minutes)

developer.apple.com › Account › **Certificates, Identifiers & Profiles** › Identifiers › « + »:

1. « App IDs » › Continue › type « App » › Continue.
2. Description: `Ozimut`. Bundle ID: **Explicit**, `com.ozimut.app`.
3. Capabilities: tick exactly **Push Notifications** and **HealthKit** — nothing else (no Associated Domains, no App Groups,
   no Sign in with Apple, no iCloud). Under HealthKit, leave « Clinical Health Records » and « Background Delivery » unticked;
   under Push Notifications, ignore « Configure » (certificates): the server uses a key (step 3).
4. Continue › Register.

No certificate and no provisioning profile to make by hand: the workflow's automatic signing creates them with the API key
of step 4.

## 3. The APNs key — notifications (10 minutes)

If Folloz's key exists, skip to item 4.

1. Certificates, Identifiers & Profiles › **Keys** › « + ». Name: `Ozimut APNs`. Tick **Apple Push Notifications service
   (APNs)**. If Apple asks for an environment and a scope, choose **Sandbox & Production** and **Team scoped (all topics)**,
   so that one key serves this app and Folloz.
2. Continue › Register › **Download**: a file `AuthKey_<KEYID>.p8`. **It can be downloaded only once**: move it to
   `C:\Kerkia\Ozimut\data\secrets\`. Note the **Key ID** shown (the ten characters in the file name).
3. Give the key to the site (the file's whole text, piped so that its line breaks survive; replace `<KEYID>`):

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; Get-Content -Raw C:\Kerkia\Ozimut\data\secrets\AuthKey_<KEYID>.p8 | npx wrangler pages secret put APNS_KEY --project-name observatoire-cn
   ```

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; npx wrangler pages secret put APNS_KEY_ID --project-name observatoire-cn
   ```

   (type the Key ID when asked)

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; npx wrangler pages secret put APNS_TEAM_ID --project-name observatoire-cn
   ```

   (type the Team ID)
4. The topic, the app's bundle (the code falls back to it, but set it so that the secrets list says it):

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; npx wrangler pages secret put APNS_TOPIC --project-name observatoire-cn
   ```

   (type `com.ozimut.app`)
5. The D1 migration 0032: done in step 0.

Pages secrets take effect at the next deploy: any push touching `site/**` or `functions/**`, or ask Claude to start one.

## 4. The App Store Connect API key — what lets GitHub sign and upload (10 minutes)

1. appstoreconnect.apple.com › **Users and Access** › **Integrations** › App Store Connect API › **Team Keys**. The first time,
   the Account Holder (you) clicks « Request Access » and accepts.
2. « Generate API Key » (or « + »). Name: `GitHub CI`. Access: **Admin**. The README explains why: the workflow uses Xcode's
   automatic signing (`-allowProvisioningUpdates`), which creates the distribution certificate and the profile in Apple's
   cloud, and keys of a lower role (App Manager, Developer) are refused there.
3. Note the **Issuer ID** (at the top of the page, a UUID) and the key's **Key ID** (in its row). **Download** the key:
   `AuthKey_<KEYID>.p8`, once only, into `C:\Kerkia\Ozimut\data\secrets\`. (This key is not the APNs key of step 3.)
4. github.com/kerkia/Ozimut › Settings › Secrets and variables › Actions › « New repository secret », four times:

   | Name | Value |
   |---|---|
   | `APPLE_TEAM_ID` | the Team ID |
   | `APP_STORE_CONNECT_KEY_ID` | the API key's Key ID |
   | `APP_STORE_CONNECT_ISSUER_ID` | the Issuer ID |
   | `APP_STORE_CONNECT_KEY` | the `.p8` file's whole text, `-----BEGIN PRIVATE KEY-----` to `-----END PRIVATE KEY-----` |

   To copy the `.p8` text without opening it:

   ```powershell
   Get-Content -Raw C:\Kerkia\Ozimut\data\secrets\AuthKey_<KEYID>.p8 | Set-Clipboard
   ```

   An Admin key is powerful (it can manage the team's apps and users): it lives only in GitHub's secrets and in
   `data\secrets`. If it ever leaks, revoke it on the same page and make another.

## 5. The app's record, the first TestFlight build, your iPhone (30 minutes, then Apple's processing)

1. App Store Connect › **Apps** › « + » › **New App**:
   - Platforms: **iOS**.
   - Name: `Ozimut` (unique on the whole App Store; if it is taken, e.g. « Ozimut – orienteering »; the name under the icon
     on the phone stays « Ozimut », it comes from the app itself).
   - Primary language: **French (France)** (English, German and Spanish are added as localisations at step 7).
   - Bundle ID: choose `com.ozimut.app` in the list (it appears once step 2 is done).
   - SKU: any private reference, e.g. `ozimut-ios`.
   - User access: Full Access. › Create.
2. Start the build: github.com/kerkia/Ozimut › **Actions** › **app-ios** › « Run workflow » › branch `main` › tick **« Archive,
   sign and upload to TestFlight (needs the Apple secrets) »** › Run workflow. The `build` job (simulator build and unit
   tests) runs first, then `release` (about 20-40 minutes in all). A missing secret is named in a warning and nothing is
   uploaded; a signing error shows as an annotation (send it to Claude).
3. When it ends green: App Store Connect › the app › **TestFlight**: the build appears « Processing », then ready (minutes to
   an hour). The build number is the workflow run's number. Export compliance is answered by the app itself
   (`ITSAppUsesNonExemptEncryption` = false in `project.yml`); if App Store Connect still shows « Missing Compliance », answer
   that the app uses no encryption other than the standard one (HTTPS) built into the system (see step 7).
4. **Internal testers**: TestFlight › Internal Testing › « + » › a group `Owner` › add yourself (internal testers must be
   users of the App Store Connect team; the Account Holder is one) › tick automatic distribution › add the build. No review
   by Apple for internal testers.
5. On your iPhone: install **TestFlight** from the App Store, sign in with the same Apple Account, open the invitation (e-mail
   or the TestFlight app) › Install. TestFlight builds expire after 90 days.
6. Others (Alec, Nadejda…): either add them as users in Users and Access (any role) and to the internal group, or make an
   **External Testing** group with their e-mails or a public link — the first build sent to external testers goes through
   Apple's Beta App Review (about a day; it needs the test information and the review account of step 7).

## 6. What to test on the iPhone (an hour; note what fails, with a screenshot)

The contract's rules, one by one. A Release build from TestFlight talks to `https://ozimut.com` and to APNs' production
service.

1. **Opening**: the sign-in card alone — e-mail, password, « Mot de passe oublié », « Entrer sans compte »; no tour, no
   « Créer un compte », nothing saying where accounts are made.
2. **Sign in** with an ordinary account; quit the app (swipe it away), reopen: still signed in.
3. **« Entrer sans compte »** (sign out first): the anti-robot check must pass and the modules page open. **If it never ends**
   (a blank box, a spinner, « Vérification anti-robot » forever), the app-bound domain limit is the likely cause
   (`app/ios/README.md`, « App-bound domain »): ask Claude to remove `WKAppBoundDomains` from `app/ios/project.yml`, run the
   workflow again (step 5.2) and test again; the site's offline copies (service worker) then do not work in the iPhone app,
   everything else does.
4. **Nothing about buying, nowhere**: the modules page, Réglages, Documentation, the rules page (`#/compte/confidentialite`)
   — no price, no « Tarifs », no « Gratuit aujourd'hui », no « Créer un compte », no « IA », no « Installer l'application »,
   no « ↗ ». Réglages has only the alerts, this device's notifications, the language and signing out.
5. **Notifications**: Réglages › this device › turn on › the system's prompt › Allow; then « Envoyer un essai »: the test
   notification arrives. Tap a notification **with the app closed** and **with it open**: its page opens. Turn notifications
   off in the app; sign out: no more notifications on that phone. (Needs steps 0 and 3; the server's HTTP/2 to Apple has
   never been verified — if nothing arrives, tell Claude the time of the test.)
6. **A GPS file from another app**: in your watch maker's app (Garmin Connect, Suunto, Coros, Polar…) or in Files, « Share »
   / « Open in… » a GPX or FIT › Ozimut: « Analyse solo » opens with it. Try also a file that started the app (app closed
   before sharing).
7. **The map**: « Analyse solo » › « Scanner la carte »: the document camera, edges found, the photo straightened and taken
   as the map. A file field's « Photographier la carte » offers camera, photos and files.
8. **Health routes**: « Mes sorties (Santé) »: the permission prompt (routes, read only), then the workouts that have a route
   — those recorded by the Apple Watch's Workout app, or by an app that writes its routes to Health (many watch makers'
   apps do not). Choose one: it becomes the track. **The headline use**: a race's map scanned plus its route from Health,
   laid together in « Analyse » — do it once end to end, outdoors if you can.
9. **Saving an export**: an image export of an analysis, a GPX: the share sheet opens (Save to Files, AirDrop, Mail).
10. **Links out**: a link to another site (FFCO, a club's site, OpenStreetMap's credit) opens **Safari**, not the app's view;
    the app stays on ozimut.com.
11. **Position**: Carto's field mode or « Ma position »: the prompt says « while using the app » only; never « always ».
12. **No network**: airplane mode, reopen the app: the native screen with « Réessayer »; network back, « Réessayer » works.
13. **Languages**: the phone in English, German, Spanish: the shell's own texts (the no-network screen, the permission prompts)
    follow; the pages follow the account's language.
14. **The rest of the site** as you use it: Arena, Stats, a runner, Coach's analyses, Pixel, the entries (« Mes inscriptions »).
    Orga and IA are not offered on a phone (as on the site).

## 7. Submitting to the App Store (two hours the first time; Apple's review: usually a day or two)

**Before each submission, the crawl**: every page opened as the app opens it (its user agent, a phone's screen), signed out,
as a visitor and with an account, in four languages; it fails on a price, a selling word, a way to create an account, a
web-only setting or « IA » (`tools/app/crawl.mjs`). It needs Edge or Chrome on the PC and is run from PowerShell (the Bash
sandbox blocks the browser). Once:

```powershell
npm install --prefix C:\Kerkia\Ozimut\Ozimut\tools\app
```

Then against the local server with today's code (launch config `pages-dev-app`, port 8757; or start it yourself):

```powershell
cd C:\Kerkia\Ozimut\Ozimut; npx wrangler@4.156.2 pages dev --port 8757 --binding ADMIN_EMAILS=nobody@example.invalid
```

and, in a second PowerShell, with a local test account (not an administrator):

```powershell
node C:\Kerkia\Ozimut\Ozimut\tools\app\crawl.mjs --base http://localhost:8757 --email <local test account> --password <its password>
```

It must end with « nothing about buying, no account making, no web-only setting ». Exit code 1 lists what was found: fix
before submitting. (`--base https://ozimut.com` also works for the signed-out pages; a visitor's pages there may stop at the
anti-robot check.) A password typed on a command line stays in PowerShell's history: use a local test account only.

**The texts** (name, subtitle, description, keywords, promotional text, review notes, screenshots' captions) are in
`docs/app/store.md`, written separately, in the four languages. Screenshots: App Store Connect lists the iPhone sizes it
requires (« Screenshot specifications » in its Help; check). **Never a screenshot of real people's results**: the site's
rule — take them on the scrambled copy (`work\synth`) and the invented maps and tracks, as for the home page's pictures.

In App Store Connect › the app:

1. **App Information** (left menu): subtitle; category (Sports first; a second one as `store.md` says); **Content Rights**:
   the app shows third-party content (federations' published results, OpenStreetMap, IGN's data) — answer as true; the rules
   page's « Independence and sources » is what Ozimut says of it; **Age Rating**: answer Apple's questionnaire honestly —
   no violence, no gambling, no medical advice beyond the « Santé » articles; *user-generated content*: yes (comments on
   shared analyses, names in results, organisers' events); *unrestricted web access*: **no** (any other site opens in
   Safari). Apple's age-rating questions changed in 2025: read them as they are. **Privacy Policy URL**:
   `https://ozimut.com/#/compte/confidentialite` (public; its « The Ozimut app » section is about the app).
2. **Pricing and Availability**: Free; the countries (all, or the four languages' countries first). The EU trader question
   (step 1.6) is asked here or at submission.
3. **App Privacy** › « Get Started ». Apple counts as « collected » what leaves the phone and is kept; what the site collects
   through the app counts, since the app shows the site. The honest answers, from the rules page and the contract:
   - *Do you or your third-party partners collect data?* **Yes.** *Used for tracking?* **No**, for every type (no
     advertising, no data broker, nothing joined with other companies' data). The shell itself collects nothing
     (`PrivacyInfo.xcprivacy`).
   - The types (purpose « App Functionality » unless said; « linked to the user » unless said):

   | Data | When it leaves the phone | Apple's category |
   |---|---|---|
   | E-mail address, name | signing in to an account made on the website | Contact Info › Email Address, Name |
   | Account number | every signed-in request | Identifiers › User ID |
   | Positions of a track or route | only when the user saves or shares an analysis (« Analyse solo »'s « Enregistrer l'analyse » is ticked by default), adds a track to an event's analysis, saves to « Mes cartes », or saves a Carto field track | Location › Precise Location |
   | A workout route read from Health | the same way, and only then | Health & Fitness › Health (it comes from HealthKit), and Fitness |
   | Heart rate, cadence from a file | only in « Mes cartes », only when the user ticks the box | Health & Fitness › Fitness |
   | Map photos and scans | when the user saves or shares the analysis or the map | User Content › Photos or Videos |
   | Comments, notes, events, entries, messages through « Nous écrire » | when the user writes them | User Content › Other User Content; Customer Support |
   | Pages viewed per day and section | every signed-in visit | Usage Data › Product Interaction — purpose Analytics |
   | How long pages take to show (no account) | every visit | Diagnostics › Performance Data — Analytics, **not linked** |

   Notes: Apple has no category for a notification token; most developers declare none (if in doubt, Identifiers › Device
   ID, App Functionality). Cloudflare Turnstile (the anti-robot check of « Entrer sans compte ») examines the browser for
   fraud prevention: Apple asks to include third-party partners — the nearest is Diagnostics › Other Diagnostic Data, App
   Functionality, not linked (check). IP addresses are kept about a day for rate limits only. **Health data read on the
   phone and never saved is not collected**: say so in the review notes. Re-read the rules page before answering; if the site
   starts keeping something new, this form changes too.
4. **The version** (« 1.0 Prepare for Submission »): screenshots, description (it must say the app reads workout routes from
   Apple Health — Apple asks that HealthKit be named in the description and visible in the app), keywords, support URL (a
   page that opens signed out — `https://ozimut.com/#/compte/confidentialite`, public, the contact e-mail in its first paragraph — `#/contact` is for accounts only), version `1.0.0`, the
   **Build** (the TestFlight build tested in step 6), copyright (« 2026 » and the seller's name), release « Manually ».
5. **Export compliance**: already answered by the app (`ITSAppUsesNonExemptEncryption` false): the shell's code uses no
   encryption; the pages use HTTPS and the browser engine's own Web Crypto (the Tracer's encrypted events), which is Apple's
   own implementation, hence exempt. If App Store Connect asks about France's encryption declaration, it does not apply to an
   exempt app (check Apple's « Complying with encryption export regulations »).
6. **App Review Information**:
   - **Sign-in required**: yes, with **a review account**: an ordinary, free account made on ozimut.com for this purpose —
     **not a « Démo » account** (those are read-only: no notifications, no saving, the reviewer would see errors), **not an
     administrator** (its e-mail must not be in `ADMIN_EMAILS`, or the reviewer sees the admin pages). An e-mail you can read
     (it is confirmed at registration), joined to **France** so that the rankings show: joining France checks a name and a
     licence against FFCO's lists, so register it with your own name and licence (several accounts on one licence are allowed;
     the site flags it to you as administrator). Give it a few things to see: a saved analysis, the agenda's alerts on.
     **Its e-mail and password go only into this form and your password manager** — never in the repository, `store.md`, a
     commit or a chat. Play's « App access » (step 12) takes the same account.
   - Contact: your name, e-mail, phone.
   - **Notes**: the text in `docs/app/store.md`. In short: a free companion to ozimut.com; nothing is sold anywhere; accounts are
     made on the website only (the app works without one: « Entrer sans compte »); how to try the headline use — share the
     sample GPX to the app, scan the sample map or open the sample photo, « Analyse »; Health routes are read on the phone and
     sent only if the user saves the analysis. If the form offers an attachment, add **invented** sample files (the reel's
     invented map and track) and a short screen recording of the race analysed — never real runners' data.
7. « Add for Review » › « Submit for Review ». Apple answers in App Store Connect's **Resolution Center** and by e-mail.
   Once approved, « Release This Version ».

The app shows the live site: **a change of the site needs no new build** (and no review), only a change of `app/ios`. Each
new build: bump `MARKETING_VERSION` in `app/ios/project.yml` (Claude), run the workflow, test it in TestFlight, choose it in
a new version, submit.

## 8. If App Review objects

Reply in the Resolution Center, politely, citing the guideline; a reply often settles it without a new build. Apple's texts:
developer.apple.com/app-store/review/guidelines (check the numbers there before quoting them).

**3.1.1 / 3.1.3 (payments).** The likely reading: « this is a front for a paid service ». The reply:

> Ozimut is free. Nothing is sold in the app or on the website today, and the app contains no purchasing, no prices and no
> call to action to buy outside the app (guideline 3.1.3(f), free stand-alone companion app). Accounts are created on the
> website only; the app does not link to account creation. The race entry fees shown under « Mes inscriptions » are real-world
> services (entering an orienteering race organised by a club), paid between the runner and the club outside Ozimut
> (3.1.3(e)); Ozimut takes no payment.

Fallbacks, in order: ask which screen they mean (they usually attach a screenshot); Claude hides that screen in the app
(`appbridge.inApp()`, a site change — deployed in minutes, no new build), and you reply that it is gone; if the race entries'
amounts are the issue, the same; ask for a phone call with App Review (offered in the Resolution Center); last, an appeal to
the App Review Board.

**4.2 (minimum functionality: « a website in a wrapper »).** The reply lists what only the app does:

> The app is built for the moment after an orienteering race, in the arena: it receives the GPS track shared from the watch
> maker's app (Garmin, Suunto, Coros, Polar files, « Open in… » / share), reads workout routes from Apple Health, scans the
> paper map with the document camera, and lays both together to analyse the race, on the phone, within minutes. It also
> delivers native notifications (start times, results going online), and saves the analyses' exports through the share
> sheet. See the attached recording.

Fallbacks: a screen recording of that use if none was sent; then native features the README lists for later — a Share
Extension (a photo shared from Photos), universal links (an Ozimut e-mail's link opening the app) — which Claude can add.

**Other objections to expect**: 5.1.1(v) account deletion — applies only to apps that create accounts: this one does not;
accounts are deleted on the website (Réglages), as the rules page says. 4.8 Sign in with Apple — required only with
third-party or social sign-in; Ozimut has its own e-mail and password. 1.2 user-generated content — Ozimut's shared content
is in closed groups (an event's analysis, a club); if asked, Claude adds a « report » link and you describe how you moderate
(you remove content on request through « Nous écrire »). 2.1 a crash or a broken page during review — ask for the device and
time, reproduce in TestFlight.

---

# Part II — Android (Google)

## 9. First of all: the debug APK on an Android phone (15 minutes)

Recommended **before anything Apple**: no account, no cost, and it tests the site in the app, the bridge, the files, the
scanner. (Notifications need step 10.)

1. github.com/kerkia/Ozimut › **Actions** › **app-android** › the latest green run (or « Run workflow » on `main`) ›
   Artifacts › **`ozimut-app-apk`** (a zip). Inside: `debug/app-debug.apk`.
2. Copy `app-debug.apk` to the phone (USB, e-mail to yourself, a cloud drive) and open it; allow « install unknown apps »
   for that one app (Files, Gmail…). Or with adb (`winget install Google.PlatformTools` once):

   ```powershell
   adb install -r C:\Users\<you>\Downloads\ozimut-app-apk\debug\app-debug.apk
   ```

3. Each CI run signs its debug APK with a new key: **uninstall the old one first** to install a newer build. Folloz
   (`com.ozimut.folloz`) is another app and stays.
4. Test as step 6, without Health (iPhone only) and with Android's back button (back in the page's history, then out of the
   app). Also: the scanner exists only where Google Play services are present; a large FIT file (tens of MB) shared to the app.

## 10. Firebase — notifications on Android (15 minutes)

The server sends to Android through **one** Firebase service account (`FCM_SERVICE_ACCOUNT`), so this app and Folloz must be
in **the same Firebase project**.

1. console.firebase.google.com › **Folloz's project if it exists** (else « Add project », e.g. « Ozimut », Analytics not needed;
   Folloz will then join this one).
2. Project overview › « Add app » › Android › package name **`com.ozimut.app`** (exactly), nickname « Ozimut » › Register ›
   download **`google-services.json`** (it now holds both apps), into `C:\Kerkia\Ozimut\data\secrets\`. Skip the SDK steps.
3. Project settings › Cloud Messaging: « Firebase Cloud Messaging API (V1) » must say Enabled.
4. GitHub secret **`APP_GOOGLE_SERVICES_JSON`** = the file **in base64** (this workflow decodes it; Folloz's secret was the raw
   text):

   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Kerkia\Ozimut\data\secrets\google-services.json")) | Set-Clipboard
   ```

   then github.com/kerkia/Ozimut › Settings › Secrets and variables › Actions › New repository secret › paste.
5. **Only if `FCM_SERVICE_ACCOUNT` is not set yet**: Firebase › Project settings › Service accounts › « Generate new private
   key » › a JSON file into `data\secrets`, then:

   ```powershell
   cd C:\Kerkia\Ozimut\Ozimut; Get-Content -Raw C:\Kerkia\Ozimut\data\secrets\<the file>.json | npx wrangler pages secret put FCM_SERVICE_ACCOUNT --project-name observatoire-cn
   ```

6. Run « app-android » again, install the new debug APK (step 9), turn notifications on in Réglages, « Envoyer un essai ».

## 11. The release keystore (10 minutes; once, kept for good)

Both Android workflows read the same secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`): **if Folloz's are set, they sign this app too** — nothing to do. With Play App Signing (the default)
this key is only your *upload* key: Google keeps the key the phones see, and one upload key may serve several apps; a lost
upload key can be replaced through Play's support.

If none exists yet: install a JDK once (`winget install EclipseAdoptium.Temurin.17.JDK`, then open a new PowerShell), and:

```powershell
keytool -genkeypair -v -keystore C:\Kerkia\Ozimut\data\secrets\ozimut-release.jks -alias ozimut -keyalg RSA -keysize 4096 -validity 10000
```

It asks a password (and a name, which nobody sees). Then the four GitHub secrets: `ANDROID_KEYSTORE_BASE64` (below),
`ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_PASSWORD` (the password typed, the same for both unless you gave two),
`ANDROID_KEY_ALIAS` (`ozimut`).

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Kerkia\Ozimut\data\secrets\ozimut-release.jks")) | Set-Clipboard
```

The next « app-android » run then also keeps **`ozimut-app-aab`**, the signed bundle Google Play takes.

## 12. Google Play Console (an hour, then two weeks of closed testing)

1. **The developer account** (skip if Folloz's exists): play.google.com/console, 25 USD once, identity check. Personal or
   organisation, as at step 1 (an organisation needs a D-U-N-S number too). The developer name is shown on Play.
2. **The rule for new personal accounts** (checked 2026-11-23 on Google's « App testing requirements for new personal
   developer accounts », support.google.com/googleplay/android-developer/answer/14151465): an account created after
   13 November 2023 must run a **closed test with at least 12 testers, opted in continuously for at least 14 days**, before
   « Apply for production » on the Dashboard. Each app needs its own: run this app's and Folloz's closed tests at the same
   time, with the same people (a Google Group of testers is simplest; each tester opts in to each app).
3. « Create app »: name **Ozimut**, default language French, App, **Free**; declarations ticked.
4. **App content** (Policy › App content), each form:
   - Privacy policy: `https://ozimut.com/#/compte/confidentialite`.
   - **App access**: « All or some functionality is restricted » › the review account of step 7.6 (its e-mail and password,
     typed there only) and one line: the app also opens without an account (« Entrer sans compte »).
   - Ads: none. Content rating: the IARC questionnaire (as Apple's: user-generated content yes, no unrestricted web).
   - **Target audience**: 18 and older, or 13 and older — not under 13 (that brings Google's Families policy; read it before
     choosing otherwise; children's accounts are made by parents on the website, not in the app).
   - **Health apps declaration** (every app must fill it, even without health features; checked 2026-11-23): the app uses no
     Health Connect; it analyses one's runs and has training tools — tick « Activity and fitness » if Google's wording fits,
     else none (check the form's list).
   - **Data safety**: the same facts as step 7.3, in Google's words: collected — Personal info (Email address, Name, User IDs),
     Location (Precise location: only tracks the user saves or shares), Photos and videos (map photos saved), Files and docs
     (maps saved), Health and fitness (Fitness info: heart rate only when ticked in « Mes cartes »), App activity (App
     interactions — Analytics; Other user-generated content), App info and performance (Diagnostics), Device or other IDs
     (the notification token). **Shared with third parties: none** (Cloudflare, Resend, Scaleway are service providers; what
     a user shares with other users by their own choice is not « sharing » in Google's terms — check its definitions).
     Encrypted in transit: yes. Users can ask for deletion: yes.
   - **Account creation and deletion**: Google's rule applies to apps that let users create an account in the app or send
     them to an account-creation flow (support.google.com/googleplay/android-developer/answer/13327111, checked
     2026-11-23). This app does neither: answer that **the app does not allow users to create an account**. If the form
     still asks for a deletion address, give `https://ozimut.com/#/compte/confidentialite` — the public rules page, whose
     « Your account's data » says the account is deleted at any time in Réglages on the website (check that it names Ozimut
     and the steps, as Google asks).
   - No foreground service, no background location, no Health Connect, no photo or media permission are declared by the app:
     those forms should not be asked (if one is, tell Claude what it asks).
5. **Store listing**: from `docs/app/store.md` (texts in the four languages, icon 512 px, feature graphic, phone
   screenshots — the scrambled data only, as for Apple).
6. **Closed testing**: Testing › Closed testing › create a track › testers (the Google Group or e-mails) › Create release ›
   upload the `.aab` from the artifact `ozimut-app-aab` › release notes › send for review. Testers open the opt-in link and
   install from Play. Count 14 days from the twelfth tester's opt-in.

## 13. Production (Google's review: days)

1. After 14 days: Dashboard › **Apply for production** (questions about the test: who tested, what changed).
2. Once granted: Production › Create release › the same or a newer `.aab` › countries › send for review.
3. Before each release, the crawl of step 7.
4. Each new release needs a higher version code: the workflow uses its run number, so every run's bundle is newer.

---

## Secrets and where they go

| Secret | Where | What | Step |
|---|---|---|---|
| `APPLE_TEAM_ID` | GitHub repository | Apple's Team ID | 4 |
| `APP_STORE_CONNECT_KEY_ID` | GitHub repository | the API key's Key ID | 4 |
| `APP_STORE_CONNECT_ISSUER_ID` | GitHub repository | the Issuer ID | 4 |
| `APP_STORE_CONNECT_KEY` | GitHub repository | the API `.p8` key's text (role Admin) | 4 |
| `APP_GOOGLE_SERVICES_JSON` | GitHub repository | `google-services.json` in base64 | 10 |
| `ANDROID_KEYSTORE_BASE64` | GitHub repository | the release keystore in base64 (shared with Folloz) | 11 |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | GitHub repository | its password, alias, key password | 11 |
| `APNS_KEY` | Cloudflare Pages (`observatoire-cn`) | the APNs `.p8` key's text (shared with Folloz) | 3 |
| `APNS_KEY_ID` | Cloudflare Pages | the APNs key's Key ID | 3 |
| `APNS_TEAM_ID` | Cloudflare Pages | Apple's Team ID | 3 |
| `APNS_TOPIC` | Cloudflare Pages | `com.ozimut.app` | 3 |
| `FCM_SERVICE_ACCOUNT` | Cloudflare Pages | Firebase's service account JSON (shared with Folloz) | 10 |

GitHub: github.com/kerkia/Ozimut › Settings › Secrets and variables › Actions. Cloudflare Pages:
`npx wrangler pages secret put <NAME> --project-name observatoire-cn`, run in `C:\Kerkia\Ozimut\Ozimut`, effective at the
next deploy. The D1 migration 0032 is not a secret but must be applied (step 0).

## Never tried on a real device

Everything below has only been compiled and unit-tested by the workflows (the iPhone app not even that before its first CI
run):

- Both shells on a phone at all: the site loading, the session kept after a restart, the no-network screen.
- « Entrer sans compte »'s anti-robot check inside the web view, and on the iPhone under the app-bound domain limit.
- The service worker in the iPhone app (offline copies).
- Native notifications end to end: the permission, the token registered, a test notification, a tap with the app closed and
  open — on Android through FCM, on the iPhone through APNs (the server's HTTP/2 to Apple never verified).
- Files shared or « Open with » from watch makers' apps (which types and names they give), Files, mail; large files through
  the bridge.
- The document scanner (VisionKit on the iPhone, ML Kit on Android).
- Health routes on the iPhone.
- Saving an export through the share sheet; a file the site serves through Android's download manager.
- The position prompt (« while using the app ») in Carto's field mode.
- `window.open` and links to other sites opening the phone's browser.
- The signing and upload jobs: the iOS `release` job and the Android signed bundle have never run with real secrets.
- App Review's and Google Play's reading of a companion app that shows the site.
