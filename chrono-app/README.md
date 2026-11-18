# Ozimut Chrono — the desktop app

Orienteering race timing (see `docs/chrono/design.md`). The app is a thin Electron shell around the same screens as
Ozimut's Chrono tab, plus what a browser tab cannot do:

- **a hub** (`hub.mjs`, plain Node): it serves the page to the app's own window, to the arena's other computers and to
  phones, ties every station's log together over WebSockets, appends every operation to a journal on disk, and listens
  for radio punches (SIRAP over TCP);
- **silent printing** (receipts, lists), a save dialog, and serial ports without a browser prompt: the page says what it connects (a SPORTident reader, an Emit reader or a receipt printer), `ports.mjs` takes the port that is surely that device or the one chosen for that use before, else asks which (tested by `tools/chrono/t_ports.mjs`).

The engine and the screens are not copied here: they are the site's own modules under `../site/assets`.

## Run in development

```
cd chrono-app
npm install        # Electron and electron-builder included (Electron's own program is fetched at the first launch)
npm start
```

The window loads `http://127.0.0.1:8377/`. Other computers and phones on the same network open
`http://<this computer's address>:8377/?k=<token>` — *Help › About* shows the exact addresses. *Help › Documentation*
(F1) opens `www/doc.html` in a second window; the hub serves it at `/doc.html` to the other stations too.

The hub alone, without Electron (this is what the hub's test uses):

```
npm install --omit=dev               # only `ws`
node ../tools/chrono/t_hub.mjs       # prints « hub: N checks passed »
```

## Smoke test

`--smoke` (or `CHRONO_SMOKE=1`) starts the app for real but out of the way: the hub on a free port with a temporary
folder, the window hidden, nothing of the user's settings or events touched. It passes once the page has drawn its home,
the preload has given it `window.chronoApp` and the main process has answered it, with no error in the page and no file
the hub could not serve; it prints `SMOKE OK <version>` and exits 0, or the errors and exits 1 (60 s at most).

```
npm run smoke                        # the development app: electron . --smoke
npm run smoke:unpacked               # the unpacked build under dist/ (after `npm run pack` or `npm run dist`)
node smoke.mjs <program>             # any packaged program, e.g. dist/Ozimut-Chrono-Portable.exe
node smoke.mjs --doc [...]           # the same, then Help › Documentation's window opened and its page drawn
```

`smoke.mjs` starts the app, reads its verdict from a file (`CHRONO_SMOKE_OUT`: a packaged Windows app has no console)
and passes on the exit code. On Linux it adds `--no-sandbox`; without a screen, run it under `xvfb-run -a`.

## Build

```
npm run pack       # the app unpacked into dist/<system>-unpacked, no installer (fast)
npm run dist       # this system's installers, into dist/
```

| System | File | What |
|---|---|---|
| Windows x64 | `Ozimut-Chrono-Setup.exe` | NSIS installer (per user, no administrator rights) |
| Windows x64 | `Ozimut-Chrono-Portable.exe` | one program, nothing installed |
| macOS | `Ozimut-Chrono.dmg` | universal: Apple silicon and Intel |
| Linux x64 | `Ozimut-Chrono.AppImage` | |

Only what the app needs of the site is packaged, as `resources/site/assets` (`build.extraResources` in `package.json`):
`js/`, `chrono/`, `app.css`, `chrono.css` and the icons — not the site's vendored libraries, pictures or map data. A
Chrono screen that starts reading another file of `site/assets` must have it added there (the smoke test on the
unpacked app fails on a file the hub cannot serve). Chromium's interface texts are kept for English, French, German and
Spanish only. `.ozchrono` event files are associated with the app (opening one merges its operations into the hub's log
of that event).

## Release (GitHub Actions)

`.github/workflows/chrono-app.yml` runs on a push to `main` that changes `chrono-app/package.json` (bump `version`
there) or the workflow itself, and by hand (`workflow_dispatch`). On Windows, macOS and Linux it runs the hub's test,
builds, runs the smoke test on the unpacked app (under `xvfb-run` on Linux; on macOS a failure is reported but does not
stop the release, until it has been seen to pass there), then publishes the four files above to **one rolling GitHub
Release, tag `chrono-app`**, replacing its files, with `chrono-app.json`:

```json
{ "version": "0.1.0", "date": "2026-11-17T20:00:00.000Z",
  "files": { "win": "Ozimut-Chrono-Setup.exe", "winPortable": "Ozimut-Chrono-Portable.exe", "mac": "Ozimut-Chrono.dmg", "linux": "Ozimut-Chrono.AppImage" },
  "sizes": { "win": 0, "winPortable": 0, "mac": 0, "linux": 0 },
  "signed": { "win": false, "mac": false } }
```

Download addresses: `https://github.com/kerkia/Ozimut/releases/download/chrono-app/<file>`. A run started by hand from
another branch than `main` builds and tests only (its files are the run's artifacts).

### Signing (optional)

Without any of the settings below the app is built **unsigned** (on macOS: signed ad hoc — `-c.mac.identity=-` —, so
that Apple silicon opens it after « Open Anyway »; Windows shows SmartScreen's « Windows protected your PC »). `signed` in `chrono-app.json` says what the build really carries (a valid Authenticode signature on both
Windows programs; a Developer ID on the macOS app). Secrets and variables are the repository's
(*Settings › Secrets and variables › Actions*); nothing of them belongs in the repository.

**Windows — SignPath** (free for open-source projects through the SignPath Foundation):

| Kind | Name | |
|---|---|---|
| secret | `SIGNPATH_API_TOKEN` | a CI user's token with the submitter role; its presence turns SignPath on |
| variable | `SIGNPATH_ORGANIZATION_ID` | |
| variable | `SIGNPATH_PROJECT_SLUG` | |
| variable | `SIGNPATH_SIGNING_POLICY_SLUG` | e.g. `release-signing` |
| variable | `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` | optional: the project's default configuration otherwise |

On SignPath: the project linked to the predefined trusted build system « GitHub.com », the SignPath GitHub App
installed on the repository. Each run sends **two signing requests**, each a zip of `.exe` files at its root (first the
app's own program `Ozimut Chrono.exe`, then `Ozimut-Chrono-Setup.exe` and `Ozimut-Chrono-Portable.exe` built around
it), so one artifact configuration serves both, along these lines (check it against SignPath's documentation):

```xml
<artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
  <zip-file>
    <pe-file-set>
      <include path="*.exe" />
      <for-each><authenticode-sign /></for-each>
    </pe-file-set>
  </zip-file>
</artifact-configuration>
```

The workflow waits up to an hour for each request (a release signing is approved by hand on SignPath).

**Windows — Azure Artifact Signing** (formerly Trusted Signing), done by electron-builder itself
(`win.azureSignOptions`, given on the command line by the workflow):

| Kind | Name | |
|---|---|---|
| secret | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` | an app registration with the signer role on the certificate profile; `AZURE_CLIENT_SECRET` turns it on |
| variable | `AZURE_SIGN_ENDPOINT` | e.g. `https://weu.codesigning.azure.net` |
| variable | `AZURE_SIGN_ACCOUNT` | the signing account's name |
| variable | `AZURE_SIGN_PROFILE` | the certificate profile's name |
| variable | `AZURE_SIGN_PUBLISHER` | the certificate's subject name (CN), exactly |

**macOS — Developer ID and notarization** (electron-builder's own environment):

| Kind | Name | |
|---|---|---|
| secret | `CSC_LINK` | the « Developer ID Application » certificate, a `.p12` in base64; its presence turns signing on |
| secret | `CSC_KEY_PASSWORD` | the `.p12`'s password |
| secret | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | for notarization |

None of the signing paths has been run yet (no certificate exists): expect to adjust them at the first real use.

## Where the data goes

- **Events**: `Documents/Ozimut Chrono/<event id>.ozchrono.jsonl` — one operation a line, appended and flushed to the
  disk as it happens, never rewritten; read back when the event is opened again (a last line cut by a power failure is
  skipped). `hub.json` beside them keeps the hub's station id and the event last opened.
- **Settings**: `settings.json` in the app's user-data folder (`%APPDATA%/Ozimut Chrono` on Windows): the hub's token, an
  optional `folder` to keep the events elsewhere, the folder files were last saved to.

Nothing is sent anywhere by the app itself; the page may exchange an event's operations with Ozimut's cloud when asked to.

## Ports

| Port | What |
|---|---|
| 8377 (TCP) | HTTP — the page, `/doc.html`, `/assets/*`, `/hub/info` — and the WebSocket `/hub?ev=<event>&k=<token>`. If taken, the next ten are tried. |
| 10000 (TCP) | SIRAP: radio punches from relays, added to the event last opened. If taken (another timing program), the app runs without it. |

Requests from this computer (127.0.0.1, ::1) need no token, unless they come from a web page of another site than the
hub's own page, ozimut.com or a local page. Every other request gives the token: `?k=`, the header `X-Hub-Token`, or
the cookie the hub sets once `?k=` was right. The first launch may ask the firewall to let other computers in.
