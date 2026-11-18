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

## Formats beyond one individual race

Everything below is state of the same log — no new operation kind; `t_formats.mjs` checks it.

- **Relay** — a class with `legs: [{ course | pool, mass? }]`; a team `teams[id] = { name, club, cls, bib, runners: [ids by leg, null for a leg
  without a runner] }`, its runners carry `team` and `leg`. A leg starts at the handover (the finish of the leg before, `hint` in
  `judge`), the first at the class's `first` (or its own `mass`). **The mass start of the late legs**: `legs[i].mass` (seconds) on a
  leg after the first sends every runner of that leg off at that time unless their handover came before it; such a result
  carries `restart`, and the team (`teams[].restart`) ranks after every team that was never restarted (`view.rankAfter`). A
  team's time is the sum of its legs' times. `io/iofxml.writeResults` writes a relay class as `TeamResult` /
  `TeamMemberResult` (the last leg's `OverallResult` carries the team's place).
- **Pairs and patrols** — a class with `team: { size, count? }`: its teams' members race together on the class's course, each
  with their own card. The team's time is its `count`-th member's (all by default: the slowest); a member who is not classified
  takes the team with them. The draw gives a team one start time (`draw`), and two team-mates on one minute are no fault
  (`checkStarts`). The view's class has `teams` (kind "group"); the individual rows stay.
- **Knockout** (`knockout.js`) — a round's heat is a class `ko: { base (the class the knockout started from), round, heat, up
  (how many go on), label }` with `first` = its mass start; its runners are **copies** of the entries (`of` = the entry, same
  card, `start` = the heat's): a card read goes to the one of its holders who has no read yet (`judge.ownerOf`), so each round's
  read finds its heat; `view.personOf` follows `of` (the duplicate-card checks count persons). `planRound` spreads a ranking
  over the heats in a snake; `qualified` takes a qualification's classified runners, or the first `up` of each heat of the round
  before plus the fastest losers; `koRanking` is the final order (the round reached, the heat's place, the time);
  `dropRound` refuses once a card was read in the round.
- **Several days** (`series.js`) — each other day is a stage kept on the event under the key `stage.<id>` = `{ name, date,
  classes: [{ name, rows: [{ k (the person's key: licence, else name and club), family, given, club, lic?, status, time?,
  points? }] }] }` (one event key a stage, so two stations adding stages never overwrite each other); the settings under
  `series = { mode "time" | "points", best (0: all), cur (the event's own race is the last stage unless false) }`. `totals`
  adds the stages class by class (by time: a runner short of a stage after the others; by points: 1000 × winner's time ÷
  time, the best stages); a person seen with a licence one day and without the next is one person. `chaseStarts` gives the
  last day's start times from the totals before it: the leader at `first`, the others behind by their deficit, beyond `cap`
  one after the other.
- **Lists and invoices** — a custom list's definition is kept under the event key `list.<id>` (`print/designer.js`: kind,
  grouping, columns, sort, filters; `normalise` on reading, definitions come from other stations); the invoices' settings
  under `inv = { rent, title, num, head, foot, skipDns }` (`print/invoices.js`: a runner's fee, else their class's; `paid`
  on the runner). A knockout copy (`of`) is never billed.

## Sync

Each station holds the whole log. `sync.js`: `hello { ev, station, have: { station: n } }` → the other side sends the
operations beyond `have`; then each new operation is forwarded. Replaying one twice changes nothing. Transports: a
WebSocket to the app's hub (`ws://<hub>/hub`), HTTP to the cloud (`POST /api/chrono/<ev>/sync`).

## The app and its hub

`chrono-app/` is an Electron app. Its main process runs **the hub** (`chrono-app/hub.mjs`, plain Node, no Electron inside:
testable alone), which holds one `Log` per event and is a station like any other:

- HTTP on port 8377 (all interfaces): `GET /` the standalone page (`chrono-app/www/index.html`), `GET /doc.html` the app's
  documentation (`www/doc.html` → `chrono/ui/appdoc.js`; same token rule as the page), `GET /assets/*` the site's
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


### The arena's computers (peers.mjs, 2026-11-18)

Every app's hub is equal: nothing is chosen as the master. `chrono-app/peers.mjs`:
- **Saying who it is**: a UDP broadcast every 5 s on port 8379 (`{ oz: "chrono", v: 1, id: <hub station>, name, port, events:
  [{ ev, n: name, d: day }] }`, the 12 latest events), to each interface's broadcast address and 255.255.255.255.
- **Linking**: a hub that hears of an event it holds too dials that hub (`ws://host:port/hub?ev=&peer=<its station>&lan=<proof>`),
  the smaller station id dialling, one link a pair (an incoming link from that hub stops the dial); the link is `sync.link` on
  both ends, so links may go through any hub and a hub that restarts catches up by itself. Lost links are dialled again every
  5 s while the other hub is heard of.
- **The event's code** (`event.lan`, six characters of `log.newCode`): made when the event gets its name (a hub's page —
  `hub.coded`, after the merge that brought the name —, or Ozimut's tab after its first cloud sync). The proof is
  HMAC-SHA256(code, `oz-join:<ev>`); the broadcast never carries the code nor anything made from it. Another hub is never trusted
  for being on this computer: it gives the hub's key or the proof (`peerOk`, ten wrong proofs a minute from an address and it
  is no longer heard).
- **Joining**: the page's home lists `/hub/info` `peers.network` (events heard of, not held); a click and the code →
  `GET /hub/join?ev=&code=` (this computer's page only) → `peers.join`: the code kept in `hub.json` `codes` until the log brings
  its own, then a dial to every hub holding it → "ok" | "code" | "unreachable" | "none".
- **By hand** (networks that drop broadcasts): `GET /hub/peer?host=&port=&k=&ev=` (this computer's page only): the other hub's
  address and key, kept in `hub.json` `statics` and dialled at every start.
- `/hub/info` adds `station`, `port`, `token`, `addresses` and `peers: { hubs, links, network }`; Préparer › Liaisons shows the
  code, the computers linked, the others heard of and the address for phones; the bar the count of computers linked.
- Tested: `tools/chrono/t_peers.mjs` (three hubs on one computer, each on its own discovery port; a wrong code, a restart, an
  address and key), and the pages of two hubs in headless Edge. Not yet on real laptops on an arena's network.

## Rules by country

`rules/<cc>.js`: statuses and their order in the lists, start interval by discipline, club separation, entry kinds
(licence, day passes), class presets, the federation's imports and exports. France, Canada and a neutral IOF pack.
Nothing French in the engine.

## Tests

`node tools/chrono/t_<name>.mjs` — no dependency, each prints its checks and exits 1 on a failure.
- `t_formats.mjs`: relay restarts, pairs and patrols, knockout rounds, totals over several days, the chase start, the relay's IOF XML. `t_lists.mjs`: the list designer and the invoices.
