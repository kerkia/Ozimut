# The Ozimut app — the contract

Decided by the owner on 2026-11-23: **a companion app to the website**, for Android and iPhone, that shows a signed-in
account every feature it may use, and **never shows an invitation to buy anything** — no price, no plan, no « subscribe », no
link towards buying (Apple's guideline 3.1.3(f), « free stand-alone apps »; Google Play's « consumption-only » apps). It is not
Ozitrac (`docs/track/ozitrac.md`), which tracks and holds no page of Ozimut; **this app does not track** (owner, 2026-11-23).

This file is the contract between the site (`site/assets/js/appbridge.js`, `offers.js`, the pages), the server
(`functions/_middleware.js`, `functions/api/push`) and the two shells (`app/android`, `app/ios`). Change it first, then the code.

## The rules

1. **The app is the live site in a web view**, plus what a page cannot do: native notifications, files opened with or shared
   to the app, the camera and the document scanner for map photos, the watch's routes from Apple Health, saving a file the
   site makes. Its headline use is **the race analysed in the arena**: the map photographed, the GPS track taken from the
   watch's app, both laid on each other in « Analyse » a few minutes after the finish.
2. **Nothing about buying, ever.** On the site everything about prices, plans and buying is drawn by one module, `offers.js`,
   and the modules of `billing/` it alone loads (« The purchase gate » below), which draw nothing about buying in the app. The
   server and the shells refuse the rest.
3. **A companion, not the main door.** No account is created in the app and none is deleted there; the settings are reduced to
   what belongs to the phone (notifications and their alerts, language, signing out). The sign-in screen says nothing of where
   accounts are made. « Entrer sans compte » stays (owner): the app opens to a visitor as the site does.
4. **No tracking.** No location in the background. The position is only read while a page that asks for it is shown (the map
   editor's field mode, « Ma position »).
5. **Four languages**, the site's rule; the shells' few own texts in French, English, German and Spanish.

## Recognising the app

The web view's user agent ends with ` OzimutApp/<version> (<android|ios>)`. `appbridge.inApp()` reads it in the page; the
server reads it on every request (`_middleware.js` `fromApp`). The site sets `<html class="in-app">` at start.

## The purchase gate (site)

- `site/assets/js/offers.js` and the modules of `site/assets/js/billing/` (2026-11-25, docs/billing/design.md §9: the sheet,
  « Réglages › Abonnement », « Mon club › Formule », the pricing page, the terms of sale, « Ce qui change », the invoices' PDF)
  are the only code that may draw a price, a plan, a « subscribe » or « upgrade » button, a link to a checkout, or a mark on a
  feature the account lacks (« Plus », « Club »), or call `/api/billing`. Only `offers.js` imports `billing/`, and only when
  billing is on for the visitor. `offers.selling()` is false in the app; every drawing function returns nothing about buying
  there. A feature the account lacks is absent in the app, never greyed with a reason. The one thing the app shows of it:
  Réglages' card with the plan the account already holds and who opened it (`billing/planstate.js`, `GET /api/billing`
  answering the app `{ plan, why }` only), its words the area `i18n/plan.<lang>.js` (keys `plan.*`, no selling word).
- Its texts are the catalogue area `i18n/billing.<lang>.js` (keys `bill.*`), which only the gate loads, and never in the app.
- `tools/offer_check.mjs` (run by the pre-commit hook) fails when: a `bill.*` key or the billing area is named outside the gate
  (`offers.js`, `billing/**`, `i18n/billing.*`); a checkout host or `/api/billing` is named outside it; a module of `billing/`
  is imported by another module than `offers.js`; a selling word appears in another catalogue (its list and the allowed
  exceptions — race entry fees, a watch's mobile plan — are in the tool).
- Server: a request from the app to `/api/billing/*`, `/api/account/register` or `/api/account/delete` is refused
  (403 `{ error: "app" }`), whatever the page did.
- Shells: never load, nor hand to the browser, a checkout host (`CHECKOUT_HOSTS` below).
- `tools/app/crawl.mjs`: before a release, every page opened with the app's user agent (signed out, a visitor, an account;
  four languages), failing on a price pattern or a selling word in what is shown.
- Race entry fees and the clubs' accounts are payments for real-world services between people and clubs: outside this gate.
- Notifications sent to the app never carry an offer (the billing e-mails are e-mails only).

## What the site does differently in the app

| Where | In the app |
|---|---|
| Signed out | A sign-in card alone: e-mail, password, « Mot de passe oublié », « Entrer sans compte ». No tour, no reel, no « Créer un compte ». |
| `#/compte/inscription` | Leads to the sign-in screen. Every link to it is absent. |
| `#/reglages` | The alerts (with their regions), this device's notifications, the language, signing out. Nothing else. |
| `#/compte/confidentialite` | The rules without the sentence on features that may become paid. |
| The top-right menu | No « Installer l'application ». |
| « ↗ » (a page alone in a new tab) | Absent. |
| A file the site saves (exports) | Handed to the shell (`saveFile`), which opens the system's share sheet. |
| « Analyse solo »'s files | « Scanner la carte » (`scanMap`) and, on an iPhone, « Mes sorties (Santé) » (`healthRoutes`). |
| Event entry by a visitor | Signing in is asked first; no account is made with the entry. |

On every phone, app or browser: « IA » is not offered (owner, 2026-11-23), as Orga is not.

## The bridge

- Android: `window.OzimutNative.call(id, name, argsJson)` (a `@JavascriptInterface`); answers by evaluating
  `window.__ozApp.resolve(id, resultJson)` or `.reject(id, message)`.
- iOS: `window.webkit.messageHandlers.ozimut.postMessage({ id, name, args })`; answers the same way.
- Shell → site events: `window.__ozApp.event({ type, ... })`, dispatched as `CustomEvent("ozimut-app", { detail })`.
- The bridge is exposed to the site's own origin only.

| Call | Args | Answer |
|---|---|---|
| `info` | – | `{ platform, version, features: [...] }` — features among `"push"`, `"files"`, `"save"`, `"scan"`, `"health"` |
| `pushState` | – | `{ state: "on" \| "off" \| "denied" \| "unavailable" }` (the system's permission and whether a token exists) |
| `pushRegister` | – | asks the system's permission if needed; `{ ok: true, kind: "fcm" \| "apns", token, env: "prod" \| "dev" }` or `{ ok: false, state }` |
| `pushOff` | – | the shell forgets its token (the site has told the server, `/api/push/native-off`); `{ ok }` |
| `saveFile` | `{ name, mime, data: <base64> }` | opens the share / save sheet; `{ ok }` |
| `scanMap` | – | the system's document scanner (edges found, perspective straightened); `{ name, mime: "image/jpeg", data }` for the first page, `null` when given up |
| `healthRoutes` | `{ days }` | iOS: `[{ id, start, end, distance, source }]`, the workouts with a route |
| `healthRoute` | `{ id }` | iOS: `{ name, gpx }` |
| `openSettings` | – | the system's settings page of the app (to allow notifications again) |

Events:
- `{ type: "files", files: [{ name, mime, data: <base64> }] }` — files opened with or shared to the app (GPX, FIT, TCX, KMZ,
  KML, images, PDF), together when they came together. The site takes them as « Analyse solo »'s inbox does. Sent once the page
  says it is ready (the shell waits for the first `info` call), so a file that started the app is not lost.
- `{ type: "push", url }` — a notification was tapped; `url` is a site address (`/#/…`), followed when it is one.

The site registers the token itself: `pushRegister`'s answer is posted to `/api/push/native` with the page's session. The
shells hold no credential.

## Native notifications (server)

- Migration `0032_app_push.sql`: `app_push (id, user_id, kind, token UNIQUE, env, label, created_at, last_ok)`.
- `POST /api/push/native { kind, token, env, label }` (session): this device receives the account's notifications; a token
  another account held moves to this one. `POST /api/push/native-off { token }`. `GET /api/push` adds `native` (the secrets
  exist) and counts these devices. Signing out in the app removes the device's token first.
- `pushToUser` sends every notification of the account to its `app_push` rows (FCM HTTP v1, APNs with topic
  `com.ozimut.app`), beside Web Push; « gone » tokens are deleted. Payload `{ title, body, url }`.
- Secrets as Ozitrac's: `FCM_SERVICE_ACCOUNT`, `APNS_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`; `APNS_TOPIC` = `com.ozimut.app`.

## The shells

- Identifiers: Android application id `com.ozimut.app`; iOS bundle `com.ozimut.app`. Name « Ozimut ». The Ozimut mark as icon.
- Base address `https://ozimut.com/` (a debug build may point elsewhere). The main frame only ever shows that origin:
  any other address opens in the phone's browser; `window.open` and `target=_blank` likewise (same origin: in the view).
  Sub-frames and scripts of other hosts load as the site asks (the anti-robot check).
- `CHECKOUT_HOSTS`, never loaded and never handed to the browser: `checkout.stripe.com`, `buy.stripe.com`,
  `billing.stripe.com`, `pay.stripe.com`, `*.paddle.com`, `*.lemonsqueezy.com`, `*.paypal.com`.
- File inputs open the system's chooser (camera, photos, files) as the page's `accept` and `capture` ask.
- The page's position requests go to the system's « while using the app » permission; never « always ».
- Cookies and site storage persist. Service workers allowed (iOS: `WKAppBoundDomains` = `ozimut.com`).
- Back: Android's back button goes back in the page's history, then leaves; iOS has the edge swipe.
- No network at start: a native screen saying so, with « Réessayer ».
- Opening files: the types above are declared, so that « Open with / Share to Ozimut » is offered by the watch makers' apps,
  the files app, mail and messaging.
- Builds: GitHub Actions `app-android.yml`, `app-ios.yml`, on a push touching `app/**` and by hand; unsigned unless the
  signing secrets exist. The owner's steps: `docs/app/setup.md`.
