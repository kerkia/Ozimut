# Ozimut Chrono — design

Race timing (the French « GEC ») inside Ozimut: owner, 2026-11-17, after the study
(https://claude.ai/artifact/1dFDHiPCfLzd5N3CbRx1tG) and the design note (https://claude.ai/artifact/HuNh42gd6RU8uqaHthADP4).
Administrators only for now. **Compatible with MeOS, never derived from it**: its files and protocols are read and written,
its behaviour re-implemented; none of its (A)GPL code, nor any other GPL code, is copied. SPORTident's protocol comes from
the MIT-licensed libraries (sportident.js, lool-ing/sportident, GecoSI).

## Pieces

| Piece | Where | What |
|---|---|---|
| Engine | `site/assets/js/chrono/*.js` | Pure ES modules, no DOM, no UI text: run in the page, in the app and under Node (`tools/chrono/t_*.mjs`) |
| Timing systems | `chrono/si/`, `chrono/emit/` | Codecs and readers behind one interface; a simulator |
| Formats | `chrono/io/` | IOF XML, OE CSV (the federation's layouts), MeOS's event file, MOP, SIRAP |
| Screens | `chrono/ui/` + `site/assets/chrono.css` | The window: bar, ribbon, rail of posts, status line; texts in `i18n/chrono.<lang>.js` |
| Tab | `pages/chrono.js`, a tab of an Orga event | Prepares, follows, closes; a window on a connected app |
| App | `chrono-app/` | Electron: the same screens, a hub for other stations and phones, silent printing, the event file |
| Cloud | `functions/api/chrono/[[path]].js` | R2 only: the operations of each event, exchanged by the stations when online |

## State

Everything is derived from a **log of operations**. `log.js` keeps them sorted by (`t`, `s`, `n`) and folds them into the
state; an operation arriving out of order replays the log. Nothing is ever recomputed away: the raw content of every card
read stays.

```
state = {
  event:    { id, name, date "YYYY-MM-DD", zero (s after midnight, the first start), country, rules "fr"|"ca"|"iof",
              type "individual"|"score"|"relay"|"training", timing "si"|"emit", club, place, terrain, startMode
              "list"|"punch"|"mass", close (s after midnight | null), score {limit, penalty, per}, cloud {token}|null },
  controls: { [code]: { code, pts?, radio?, adj? (s removed from the leg into it), any? [codes] } },
  courses:  { [id]: { id, name, length (m), climb (m), controls [code…], score? true } },
  classes:  { [id]: { id, name, course (id|null), pool? [course ids], first? (s), step? (s), nc?, fee?,
              legs? [{ course|pool, mass? (s) }] } },
  clubs:    { [id]: { id, name, code? } },
  runners:  { [id]: { id, family, given, club (id|null), cls (id|null), card (number|null), lic?, cat?, sex?, birth?,
              bib?, start? (s after midnight), status? (a manual status), adj? (s added to the time), kind? (entry kind
              of the rules), rent? (1 = rented card), fee?, paid?, team?, leg?, here? (checked in at the start), note? } },
  teams:    { [id]: { id, name, club, cls, bib, runners [runner ids by leg] } },
  reads:    { [id]: { id, card, at (epoch ms), st (station), sys "si"|"emit", start, finish, check, clear (s|null),
              punches [[code, s]…], runner? (id | 0 = set aside), ed? { punches?, start?, finish? } (a referee's
              correction: it replaces what the card says, the card's own content stays), rel? (Emit: times from the
              card's own zero) } },
  radio:    [ { code, card, s, at, src } ],
  notes:    [ { id, at, by, kind "complaint"|"note"|"pay"|"close", ... } ],
}
```

Times are seconds after the event day's midnight, local time (may pass 86400). `times.js` turns what a card gives (12-hour
clocks, weekday) into that.

### Operations

`{ s: station id, n: its sequence number, t: hybrid clock (ms × 1000 + counter), by: who, k, … }`

| `k` | Fields | Effect |
|---|---|---|
| `ev` | `p` (patch) | event fields, last writer wins |
| `put` | `c` (collection), `id`, `p` (patch) | a row's fields, last writer wins; `p: null` deletes |
| `many` | `rows: [[c, id, p]…]` | an import, as one operation |
| `read` | `r` (a read, above) | a card read: never changed |
| `assign` | `id` (read), `runner` | whose read it is (0: set aside) |
| `edit` | `id` (read), `e` ({ punches?, start?, finish? } or null) | a card corrected by hand: `e` replaces what the card says (null: back to the card) |
| `punch` | `p` ({ code, card, s, at, src }) | a radio punch |
| `note` | `x` | a complaint, a payment, a closure |

The referee's list of manual edits is the log filtered: every operation carries its station, time and author.

## What a reader gives

`read = { sys, card, family, start, finish, check, clear, punches: [{ code, t, dow?, half? }], at, rel? }` — each time
`{ t (s after midnight, or within its 12 hours when `half`), dow? (0 = Sunday), half? }` or null; `rel: true` when the times
count from the card's own zero (Emit). Readers never judge.

`openReader(transport, { onCard, onPunch, onState, onError })` → `{ info(), setTime?(), close() }`.
A transport is `{ open(opts), write(bytes), onData(cb), close() }`: Web Serial in a page, a simulator in tests.

## What the formats exchange

Importers return a **set**, by names, never ids:
`{ event?, clubs: [{ name, code }], courses: [{ name, length, climb, controls: [codes] }], classes: [{ name, course }],
runners: [{ family, given, club, clubCode, cls, card, lic, cat, sex, birth, bib, start, nat, rent, fee, paid }],
reads?: […] }`. `model.importSet` turns it into operations.

Exporters take a **view** (`view.js`): `{ event, classes: [{ id, name, course: { name, length, climb, controls },
rows: [{ place, family, given, club, clubCode, lic, card, cat, sex, birth, bib, start, finish, time, status, splits:
[{ code, t }], points? }] }] }` with `status` one of `ok mp dnf dns dsq ot nc run wait`.

## Sync

Each station holds the whole log. `sync.js`: `hello { ev, station, have: { station: n } }` → the other side sends the
operations beyond `have`; then each new operation is forwarded. Replaying one twice changes nothing. Transports: a
WebSocket to the app's hub (`ws://<hub>/hub`), HTTP to the cloud (`POST /api/chrono/<ev>/sync`).

## The app and its hub

`chrono-app/` is an Electron app. Its main process runs **the hub** (`chrono-app/hub.mjs`, plain Node, no Electron inside:
testable alone), which holds one `Log` per event and is a station like any other:

- HTTP on port 8377 (all interfaces): `GET /` the standalone page (`chrono-app/www/index.html`), `GET /assets/*` the site's
  assets (the repository's `site/assets` in development, a bundled copy once packaged), `GET /hub/info` →
  `{ name, version, events: [{ ev, name, date, ops }] }`.
- `WS /hub?ev=<event id>&k=<token>`: JSON text frames, the messages of `sync.js` (`hello`, `ops`, `ready`, `no`). The hub
  links every socket to the event's log with `sync.link`; what one station adds reaches the others through it.
- A token (random, kept in the app's settings) is asked of every request not coming from 127.0.0.1 / ::1.
- Each event's operations are appended to `<folder>/<ev>.ozchrono.jsonl` (one JSON a line; `store.fromFile` reads it) and
  read back when the event is opened again. Folder: `Documents/Ozimut Chrono` by default.
- A TCP listener (port 10000, SIRAP) turns radio punches into `punch` operations of the event last opened.

The app's window loads `http://127.0.0.1:8377/` — the same page other computers and phones open at the hub's address — so
the window is one more station. The preload exposes `window.chronoApp`:
`{ version, hub() → { port, token, addresses, name, folder }, printers() → [{ name, isDefault }],
print(html, { printer?, silent?, widthMm? }) → { ok, error? }, saveFile(name, data) → path | null, openFolder() }`.

The page (`chrono/ui/net.js`) connects to the hub it was served by (`location.host`), or — from ozimut.com's Chrono tab —
to an app on the same computer (`ws://127.0.0.1:8377/hub`).

## Rules by country

`rules/<cc>.js`: statuses and their order in the lists, start interval by discipline, club separation, entry kinds
(licence, day passes), class presets, the federation's imports and exports. France, Canada and a neutral IOF pack.
Nothing French in the engine.

## Tests

`node tools/chrono/t_<name>.mjs` — no dependency, each prints its checks and exits 1 on a failure.
