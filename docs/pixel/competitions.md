# Pixel — competitions, the week's race, the menu, the keys (contract)

Owner, 2026-11-28. **Change this file first, then the code.** « Pixel » is the module's name for now (a new name is being
chosen): addresses stay `#/pixel…`, code names `virtually*`.

## 0. Who sees it

Everything below is **the administrators' only for now**, behind one switch on each side:

- browser: `site/assets/js/games/vnext.js` — `export const pixelNext = () => !!auth.session()?.admin;`
- server: `functions/_lib/virtual.js` — `export const compAllowed = (env, user) => !!user && isAdmin(env, user);`

An account without it sees Pixel exactly as before (the page's own tabs Entraînement / Analyse / Avatar, the « Carte du
jour », no countdown). Opening it to all later = those two lines.

## 1. Vocabulary

- **Training** (« Entraînement »): the maps and the old training events (Trois Pignons…), « Terrain libre ». Played as often
  as one likes, pause allowed, ghosts, palmarès. **No « Carte du jour » any more** (with the switch).
- **Competition**: played **once**, on **one course** per account, **no pause**. Two kinds:
  - `orga` — an organiser's, from their own map and courses (an event of `/api/virtual/events`, `type: "competition"`);
  - `week` — « Compétition de la semaine », invented by the site, one a week (Monday–Sunday, Paris), id `week-YYYYWW`
    (`games/vweekid.js`, shared by browser and server), format in turn `ld` → `md` → `sprint`, three courses `a`, `b`, `c`.
- Results show while the competition runs (times only). Routes, ghosts-from-rivals and the analysis open **after its last
  day** (unless an organiser allowed ghosts, §4). Only competitions count in the virtual index (unchanged rule).

## 2. Menu and addresses (with the switch)

Pixel's tabs become entries of the bar's module menu (`app.js moduleMenus().pixel`), as Stats' or Coach's. Each address is
a route of its own, all drawn by `pages/virtually.js` (its `render` receives the route and shows that one view, no tab row):

| Menu | Address | Route key |
|---|---|---|
| Entraînement | `#/pixel` | `virtually` |
| Compétitions | `#/pixel/competitions` | `virtuallyComp` |
| Classement | `#/pixel/classement` | `virtuallyRanking` |
| Analyse | `#/pixel/analyse` | `virtuallyAnalysis` |
| Avatar | `#/pixel/avatar` | `virtuallyAvatar` |
| Orga | `#/pixel/orga` | `virtuallyOrga` (accounts with Orga, computers) |

« Résultats » is no longer a page: a competition's results are on its card in Compétitions; a training has its palmarès.
Old `#/pixel?onglet=…` addresses lead to the matching address. **Avatar** has two page tabs (`ui.pageTabs`, `?onglet=`):
« Apparence » (`games/vavatar.js renderAvatar`) and « Commandes » (`games/vkeysui.js renderControls`).

## 3. Server

### 3.1 `functions/api/virtual/comp/[[path]].js` (new; accounts with `compAllowed`, else 403 `{ error: "closed" }`)

```
GET    comp                       { comps: [Comp], today }   today = Paris day YYYY-MM-DD
GET    comp/<id>                  Comp
POST   comp/<id>/register { course, sig? }    → { my }      one course an account; changes it while not started
DELETE comp/<id>/register                     → { ok }      withdraw, while not started
POST   comp/<id>/start { course, sig? }       → { ok, at }  the one attempt begins (called when « Partir » is pressed)
POST   comp/<id>/runs { course, t, sp, d, route, cs, seed, sig? }   → { id, at }   the finished run
POST   comp/<id>/runs { course, dnf: true }                          → { ok }       abandoned
GET    comp/<id>/results          { over, courses: { <course>: [Row] } }
```

`Comp = { id, kind: "orga"|"week", name, format: "ld"|"md"|"sprint"|"", from, to, state: "soon"|"open"|"over", org,
env, ghosts, courses: [{ id, name, length, climb, controls }] ([] for a week: made in the browser), thumb, base (an orga's
package address `/api/virtual/events/<id>/pkg/`), source, scale, std, lonlat, tex: [roles], mine (its organiser),
my: null | { course, at, started, done, dnf, t, run }, entrants: { <course>: n } }` — a week: `env` null, `source` "gen",
`courses` [], `org` "", `scale` 0, `std` "", `lonlat` null, `thumb` false, `base` "". `my.at` the registration's time,
`my.started` the start's ("" before), `my.run` the run's id ("" before), `my.t` null before; `entrants` counts every registration
(started or not).

`Row = { u, name, state: "ok"|"running"|"dnf", t, at, mine, run }` — only the accounts that started; `at` the start's time;
`t` null unless ok; `run` the run's id once finished (else ""); never a route. Sorted ok by time, then running, then dnf.

- The list: every **published** orga competition (soon, open, over for less than 60 days), the current week, the next week
  (`soon`, name and format only) and the 8 weeks before. A week's `name` is empty (the page words it).
- Dates are Paris days, inclusive. `state` from `from`/`to` (`weekState` for a week).
- Registering (and changing course, withdrawing) is open while the competition is `soon` or `open` — for a week, up to the next
  week —; starting only while `open` (Paris day); a run is accepted while the start is under 6 hours old, even past the last day.
- A week's world: `register` keeps `sig` when given; `start` must carry a `sig` equal to the registered one (none registered:
  the start's is kept); `runs` must carry that same `sig`; else 409 `world`. A week's results list only the rows whose `sig` is
  the most frequent among its starters (one browser that made another world never pollutes the table).
- Errors (JSON `{ error }`): 400 `bad request` (unknown course, bad sig, bad t/sp), 403 `closed` (not allowed; not open for that
  action; a run posted 6 hours after its start), 403 `not registered`, 403 `demo` (a demo account's writes), 409 `started`
  (register/withdraw/start after a start), 409 `not started` (a run or `dnf` before `start`), 409 `already run` (a second run, or
  after `dnf`), 409 `other course`, 409 `world`, 404 `not found` (no such week, or an event that is not a published, built
  competition with both dates), 429 `rate` (register/withdraw/start 30 an hour, runs 20 an hour, per account).
- A started attempt without a run for 6 hours counts as `dnf`.
- An orga competition's organiser may also try it from Orga through `/api/virtual/events/<id>/runs` (a training run, as
  before): those never appear in the competition's results.
- Storage (R2): `virtual-reg/<comp id>/<u>.json` — `{ course, at, started, run, t, dnf, sig }`, mirrored in custom metadata
  (`c, at, st, run, t, dnf, sg` = sig, `n` = display name) so one list gives entrants and results; `u` = `runnerHash`. Runs as every
  Pixel run: `virtual-runs/<comp id>/<course>/<u>-<time36>.json`, metadata as today with `k: "competition"`, `e: <comp id>`,
  and for a week `ws: <sig>` (the world's signature the browser made, 1–8 hex; `summary()` returns it as `ws`).
- Account deletion removes the account's `virtual-reg/*/<u>.json`; deleting an event removes its `virtual-reg/<id>/`.

### 3.2 `functions/api/virtual/[[path]].js`

- `GET runs?race=week` — every week's runs (prefix `virtual-runs/week-`), as `race=day`.
- A competition's route (`runs/<race>/<run>`, `runs/<race>/routes`): one's own; an administrator; **after the competition's
  last day** (an event's `to`, a week's Sunday — Paris days); or during it when the event has `ghosts: true`.
- `POST runs` refuses `week-…` races and `kind: "competition"` with 400 `bad request` (competition runs go through
  `comp/<id>/runs`); every run it keeps is a training.

### 3.3 `functions/api/virtual/events/[[path]].js`

- An event gains `ghosts` (boolean, default false), `format` ("" | "ld" | "md" | "sprint", the organiser's word),
  `env.season` ("" | "spring" | "summer" | "autumn" | "winter", beside weather/time/lamp) and `tex` (roles sent).
  `view()` returns them. `mapOpt` is ignored for a competition (always the whole map).
- Publishing a competition needs both dates, in order: 400 `dates` (also a PUT that would leave a published competition
  without them). A new event is a competition unless `type: "training"`. The events' « open today » uses Paris's day.
- `tex` PUT answers `{ ok, tex }` (the roles present); 413 `size` over 700 000 bytes; 400 when the body is not a WebP (its
  RIFF/WEBP header) or the role unknown.
- Terrain photos: `PUT events/<id>/tex/<role>` (body `image/webp`, ≤ 700 KB, role one of
  `floor | path | rock | bark | grass | leaves`) → R2 `virtual-ev/<id>/tex-<role>.webp`; `DELETE` the same; served by
  `GET events/<id>/pkg/tex-<role>.webp`. No rebuild needed. The browser prepares the picture (§5).
- Events of `type: "training"` stay as they are (played in Training); Orga no longer lists nor creates them.

## 4. The game (`games/virtually.js mount(root, raceId, opts)`), new options

- `countdown: true` — after « Partir »: the scene shows, the runner stands, **the map is a blank sheet in every view** (the
  briefing never shows the map either), a large 5 · 4 · 3 · 2 · 1 over the scene with a start clock's beeps (a short beep
  each second, a longer and higher one at zero); at zero the map appears, the race clock starts and **the runner sets off
  at ×0.5 at once** (any speed chosen from there).
- `beforeStart: async () => true | string` — awaited when « Partir » is pressed, before the countdown; a string is an error
  shown on the briefing (the race does not start).
- `noPause: true` — no pause button, Escape and a hidden tab do not pause, the race clock follows the wall clock (time with
  the tab hidden counts); no « Recommencer »; « Abandonner » asks to confirm then calls `opts.onAbandon()`. The briefing and
  the commands' list say so.
- `tex: { <role>: url }` — an event's terrain photos, laid over the biome's set (`games/vforest.js loadPhotos(set, tex)`).
- `env.season` — drawn by `games/vweather.js` (`SEASONS`, `envText`).
- Keys: every keyboard action reads its key from `games/vkeys.js` (`ACTIONS`, `loadKeys()`, `saveKeys()`, `resetKeys()`,
  `keyLabel(code)`); kept in this browser (`localStorage ocn.vt.keys`) **and with the account**: `GET|PUT /api/virtual/prefs`
  (`{ keys, at }`, R2 `virtual-prefs/<runner hash>.json`, deleted with the account), written at each change, read once a
  visit (`syncKeys()`), the later of the two winning. The commands' lists show the keys in use.
- `games/vforest.js` exports `TEX_ROLES` and `prepareTexture(file) → Promise<Blob>` (a 512 × 512 WebP, tiling, brought
  round mid-grey as the built-in photos, so that the biome still tints it).
- New texts of the game and of « Commandes »: area `i18n/vplay.{fr,en,de,es}.js` (keys `vk.*`), loaded by the page with
  `loadArea("vplay")` beside `virtually` (`games/vkeys.js`, `vweather.js` and `virtually.js` also load it themselves).

As built (2026-11-28):

- `mount` options: `countdown`, `noPause`, `beforeStart`, `onAbandon`, `tex` as above. `beforeStart` may also throw (its
  message is shown); anything but `true` keeps the briefing (a non-string: `vk.startFailed`). Phases: `ready` → `count` →
  `run` → `done` | `out` (abandoned). During `ready`/`count` with `countdown` the map panel is white paper and cannot be
  moved, zoomed or turned; the description sheet stays. « Abandonner » (with `noPause`, in place of the pause button) is
  offered from the countdown on; after confirming, `onAbandon()` is called (not awaited) and a card « Course abandonnée »
  with `data-exit` (`onExit`) shows. With `noPause` the finish card has no « Recommencer ».
- `games/vkeys.js`: `ACTIONS` [{ id, group, keys, also?, show? }] — ids `faster slower left right stepL stepR punch lv0 lv1
  lv2 lv3 pos pause` (run), `map mapL mapR oRun oLeg oNorth frame compline` (map), `views sheet person help full` (view);
  `pos`, `pause`, `frame`, `full` have no default key (bindable). `GROUPS`, `MAX_KEYS` (2), `FIXED` (Escape, Enter… never
  bound), `loadKeys()` → { id: [codes] }, `saveKeys(b)`, `resetKeys()` → the defaults, `isDefault(b, id)`, `match(b, id, e)`,
  `boundTo(b, code, but)`, `keyLabel(code)`, `labelsOf(b, id)`, `keysReady` (a promise: the browser's Keyboard Map, ≤ 400 ms;
  without it the labels are guessed from the site's language: AZERTY in French, QWERTZ in German). `map` keeps « M by its
  letter » and `help` « ? » while they keep their default keys.
- `games/vkeysui.js`: `renderControls(el)` → Promise<cleanup>.
- `games/vforest.js`: `TEX_ROLES`, `prepareTexture(file)` → Promise<Blob> (WebP, else JPEG), `loadPhotos(set, tex)` (a string as
  2nd argument is still the folder), `overlayPhotos(photos, tex)` (what the game uses on the package's photos). `floor` →
  the litter (its normal map dropped), `path` → the gravel, `rock` → the stone, `bark` → bark and the set's pine bark,
  `grass` and `leaves` → cards cut to the set's (or the drawn) card shapes, filled with the photo.
- `games/vweather.js`: `SEASONS`, `envOf(e).season`, `envText` names the season (`vk.season.*`; `vk.season.none` for a
  chooser's empty choice); `plain(e)` still means a clear day whatever the season.
- CSS: `.vt-count`, `.vt-count-n`, `.vt-abandon`, `.vt-out`, `.vt-nopause`, `.vt-countrule`, `.vt-brief-err`, `.vt-keys-kb`,
  `kbd` in `.vt-keys`, `.vt-kk*`, and the page's `.vk-*`.

## 5. The week's world (`games/vweek.js`, deterministic as the « Carte du jour » was)

```js
weekOpts(id)      // → the generator's options (null for a bad id): { format, seed, size, type, relief, detail, green, paths,
                  //     levels, tries, ends, retry, estimate } (forest) or { format, sprint: true, seed, size, buildings,
                  //     gardens, parks, levels, tries, ends, retry, estimate } — structured-cloneable, posted to the worker
weekRace(id, { title, onStep })   // → Promise of { id, name, gen: true, week: true, format, sig, ms, size, seed,
                  //     race: { id, scale, std, source, courses }, load: async () => package }  (as pages/virtuallygen.js makes;
                  //     kept in memory for the visit, by id)
WEEK_TYPES        // the forest types drawn from: moraine, karst, sandrock, valley (not the flat « pine »)
```

- Made by `games/vgenworker.js build(opts)` (the worker, `vgenpack.js`'s inline fallback and `tools/virtually/t_week.mjs` run
  the same function). The levels are `games/vcourse.js WEEK_LEVELS.ld | .md` and `games/vcoursesprint.js WEEK_SPRINT_LEVELS`.
- Each course carries `min`: its estimated race time at ×1 (minutes; `vcourse.js timer`, the game's speed model on the ground,
  cells of 2 m in a forest, 1 m in a town). Its length follows the terrain's pace (a hilly karst runs at ~11 min a km, a flat
  moraine at ~7) within 0.75-1.3 × the level's km, so that the target time holds.
- A seed that gives fewer than three courses is followed by seed + 1, + 2 … (up to 6 more; `seed` in the result says which).

- A forest week: always much relief and much detail (both in the upper third of the generator's range), the rest varies
  with the week. A sprint week: every dial of the town (buildings, gardens, parks) anywhere on its range.
- `ld`: a forest of 1 600 m; few controls, a few very long legs with real route choices. `md`: a forest of 1 200 m; many
  short legs, hard navigation, changes of direction. `sprint`: an invented town.
- Courses `a` (the longest, hardest), `b`, `c` (shorter, a level easier). Target race times at the game's ×1 (a good club
  runner), after the IOF's winning times (long 70–100 min, middle 30–35, sprint 12–15): `a` ≈ 70 / 30 / 14 min — a middle
  2 to 3 times shorter than a long.
- The same id gives the same world and courses in Node and in every browser (`sig` = `vgenpack.courseSig(courses)`).

## 6. Pages

- `pages/virtuallycomp.js` (Compétitions): « En cours », « À venir », « Terminées ». A competition chosen: its courses, the
  entrants per course, **« S'inscrire »** on one course (changed while not started), then **« Prendre le départ »** — a
  confirmation first: one attempt, no pause, about how long it takes without a break (play time = race time ÷ 2), a tab
  closed or « Abandonner » = abandoned. The run: `mount` with `countdown`, `noPause`, `beforeStart` = `POST start`,
  `onFinish` = `POST runs`, `onAbandon` = `POST runs { dnf }`. Its results under it, refreshed while it is open; once over,
  « Analyser » (the Analyse page on that competition).
- Analyse: a competition appears once over (an organiser and an administrator before). Its map can be saved in « Mes
  cartes » as in Coach's analyses; **kept by itself for an orga competition** (the runner's own run, `autoKeep`), by hand
  only for a week's.
- Training: no « Carte du jour » tiles; `countdown` on every run. An organiser's try from Orga runs in the Orga view itself (a
  training run, pause allowed, `countdown`), Orga drawn again when it is left.
- How the pages do it: `pages/virtually.js` passes `renderComp(el, ctx)` its helpers (names, clock, the saved view and ghost count,
  `weekWorld(id, onStep)` — one week's world made once a visit, shared by Compétitions and Analyse —, `noteComps`, `changed`,
  `analyse(id)`); a week's runs come from `runs?race=week`, those of the world most runs were made on (`ws`) counted; the analysis
  object of a finished competition carries `opts.mymaps: true` and `autoKeep` (false for a week), which `pages/shared.js` honours
  (no automatic keeping, no « Garder automatiquement » box).
- `pages/virtuallyorga.js` (Orga = creating competitions): the list holds the account's **competitions only**. « Nouvelle
  compétition » starts from the files — the map (`.ocd`) and the courses (an OCAD course file or IOF XML; one `.ocd`
  holding both is enough) — dropped or chosen; that creates the event (named after the file), sends the files and opens
  its page: name, **dates (from – to, required)**, format, **ghosts allowed or not**, season, weather, time of day,
  **terrain photos** (one per role, optional), « Construire », try a course, « Publier ». « Comment ça marche » is an
  ordered list of those steps.
- New texts: areas `i18n/vcomp.*.js` (keys `vc.*`: the menu, Compétitions, Analyse's additions) and the existing
  `i18n/virtually.*.js` for Orga (`vo.*`, edited by the Orga work only).
