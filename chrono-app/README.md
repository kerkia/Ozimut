# Ozimut Chrono — the desktop app

Orienteering race timing (see `docs/chrono/design.md`). The app is a thin Electron shell around the same screens as
Ozimut's Chrono tab, plus what a browser tab cannot do:

- **a hub** (`hub.mjs`, plain Node): it serves the page to the app's own window, to the arena's other computers and to
  phones, ties every station's log together over WebSockets, appends every operation to a journal on disk, and listens
  for radio punches (SIRAP over TCP);
- **silent printing** (receipts, lists), a save dialog, and the card reader's serial port without a browser prompt.

The engine and the screens are not copied here: they are the site's own modules under `../site/assets`.

## Run in development

```
cd chrono-app
npm install        # Electron included
npm start
```

The window loads `http://127.0.0.1:8377/`. Other computers and phones on the same network open
`http://<this computer's address>:8377/?k=<token>` — *Help › About* shows the exact addresses.

The hub alone, without Electron (this is what the test uses):

```
npm install --omit=dev               # only `ws`
node ../tools/chrono/t_hub.mjs       # prints « hub: N checks passed »
```

## Build

```
npm run dist       # electron-builder: Windows (NSIS installer + portable), macOS (dmg), Linux (AppImage), into dist/
```

`../site/assets` is copied into the package as `resources/site/assets`; `.ozchrono` event files are associated with the
app (opening one merges its operations into the hub's log of that event).

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
| 8377 (TCP) | HTTP — the page, `/assets/*`, `/hub/info` — and the WebSocket `/hub?ev=<event>&k=<token>`. If taken, the next ten are tried. |
| 10000 (TCP) | SIRAP: radio punches from relays, added to the event last opened. If taken (another timing program), the app runs without it. |

Requests from this computer (127.0.0.1, ::1) need no token, unless they come from a web page of another site than the
hub's own page, ozimut.com or a local page. Every other request gives the token: `?k=`, the header `X-Hub-Token`, or
the cookie the hub sets once `?k=` was right. The first launch may ask the firewall to let other computers in.
