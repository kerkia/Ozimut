# Ozimut — La course d'orientation, en cartes et en chiffres (O'CN until 2026-10-19)

Independent, unofficial site (https://ozimut.com; https://ocn.kerkia.com until the move, see « The move to ozimut.com ») that scrapes the French orienteering federation's
national ranking (FFCO, cn.ffcorientation.fr), recomputes it with alternative methods, and shows rankings,
runner histories, clubs, comparisons, an agenda of upcoming events and per-race details. The site's UI is
**in French**; code, comments and commit messages are in English.

## Layout

| Path | What |
|---|---|
| `ffco_scraper/` | Scraper (`fetcher`, `crawler`, `parser`, `store`, `updater`), agenda scraper (`agenda.py`), and the CN engine (`cn.py` = formulas, `cn_engine.py` = methods and computation, `cn_schema.sql`) |
| `update.py` | The one entry point for updates: fetch → recompute → rebuild site data → deploy → mail digests. Also holds the one-off **migrations** |
| `build_site.py`, `site_extras.py`, `site_io.py` | Turn the database into the static JSON under `site/data/` (runner buckets `r/`, races `c/`, month-end snapshots `snap/`, clubs, network, `meta.json`) |
| `site_ask.py` | The Parquet tables « IA » queries in the browser (`site/data/ask/`: runners, clubs, races, results, cn), rebuilt by every build from the published data |
| `ffco_scraper/prov/` | Provisional results (« Résultats »): organisers' results, often before FFCO publishes — races (`races.py`), sources (`sources/`: liveresultat, WinSplits, Helga, Orientation Data, O'Live, SPORTident Center, the club's site), parsers (`parsers/`: OE/MeOS HTML, IOF XML, PDF), matching to licences (`match.py`), provisional scores (`compute.py`), run + output (`run.py`) |
| `notify.py` | E-mail digests (new results, new competitions in subscribed regions) through `/api/notify` |
| `site/` | Static single-page app (vanilla JS modules, no build step). `assets/js/pages/*.js` one module per page, `i18n.js` all French text, `cn.js` the CN computation mirrored in the browser, `data.js` data access and the column index maps `R` (runner race rows) and `C` (race result rows) |
| `functions/` | Cloudflare Pages Functions: `_middleware.js` (login gate, deny by default), `_lib/club.js` (an account's club, a race's organiser), `_lib/events.js` + `api/events/[[path]].js` (« Orga › Gérer »: the events and their teams, who may act as a competition's organiser), `api/account/*` (accounts on D1), `api/admin/*`, `api/notify.js`, `api/ffco-history.js` and `api/ffco-cn.js` (proxies to FFCO pages, logged-in users only, cached and rate-limited), `api/analyses/[[path]].js` (the shared GPS analyses, in R2), `api/tracer/[[path]].js` (the Tracer's course-setting events, in R2) |
| `migrations/` | D1 schema migrations |
| `ci/state.py` | Packs/unpacks the database and site state to/from Cloudflare R2 between CI runs |
| `mapgen/` | **Generated maps** (a prototype, 2026-11-01): 1 km tiles of an orienteering map from IGN's LiDAR HD through karttapullautin, with OpenStreetMap's features drawn over (`run.py`, `osm.py`, `lambert93.py`; `python -m mapgen tiles|area|ci`), made by `.github/workflows/lidarmap.yml` on the site's request (see « Generated maps ») |
| `site/assets/js/mapper/` | **Cartographier** (Orga, 2026-11-06): the map editor, OCAD's records as its document (`docs/mapper/model.md`); see « Orga › Cartographier » |
| `.github/workflows/update.yml` | Hourly quick run, 03:00 Paris full run, 06:00 Paris agenda run, Sat/Sun evening provisional-results runs (every 20 min), deploy on push |
| `run_cn.py`, `query_cn.py`, `merge_methods.py` | Developer tools (recompute one method, inspect a runner, merge DBs) |
| `live/` | **O'CN's live relay**, Worker `ocn-live` (2026-10-18): Durable Objects — one `LiveRace` per liveresultat competition (« En direct »), MeOSDjango, O'Live or SPORTident Center race, or organiser's broadcast (« Organisation › Direct »), and the `Directory` (liveresultat's, MeOSDjango's and O'Live's lists, the broadcasts). No public address (`workers_dev = false`): O'CN reaches it only through its Durable Object bindings (`wrangler.toml` LIVE_RACE, LIVE_DIR) — `functions/api/live/list.js`, `functions/ws/[comp].js`, `functions/api/live/push.js`, `mop.js` (MeOS's online results) and `broadcasts.js`. Deployed by hand: `cd live && npx wrangler deploy`; local: launch config `ocn-live-dev` (8786), the local Pages dev binds to it; `live/dev/lr-mock.mjs` replays recorded races as liveresultat's API (`--var LR_API:…`) |

On the PC everything is under `C:\kerkia\Ozimut` (one folder since 2026-11-07; `C:\kerkia\CO` and `C:\kerkia\cn-data` before):
`Ozimut\` this repository (`code\` until 2026-11-09: renamed so that the Claude app names its sessions « Ozimut »), `data\` what the code reads outside git (the database, the HTTP cache, geonames, naturalearth, relays,
lidarmap, the secrets and pending files; `paths.DATA_DIR`), `work\` studies and test material the code never reads (`synth`,
`study`, `scratch-scripts`, `Test files`). Nothing syncs `C:\kerkia` any more (OneDrive until 2026-10-08, then Proton Drive
until early November: both rewrote files mid-edit, leaving « Edit conflict » copies). **Backup** (2026-11-10): Kopia snapshots the
whole of `C:\Kerkia` every hour into the encrypted repository `C:\KerkiaBackup\repo` (Task Scheduler folder `\Kerkia\`, scripts
and logs in `C:\KerkiaBackup\tools` and `logs`, restore steps in `C:\KerkiaBackup\README-restore.txt`), and pCloud Sync copies
`C:\KerkiaBackup` to pCloud's `/KerkiaBackup`; KopiaUI browses and restores. Its password is the owner's alone.
Not in git (see `.gitignore`): the database and HTTP cache (`C:\kerkia\Ozimut\data` on the PC, `paths.py`, env `CN_DATA_DIR`),
`site/data/` and `site/auth/` (generated), `.dev.vars` (local secrets), exports. **The repository is public:** never
commit results, personal data, secrets or credentials.

## Hosting and deployment

- **Cloudflare Pages** project `observatoire-cn` (static `site/` + `functions/`), custom domains `ozimut.com` (bought
  2026-10-18 at Cloudflare Registrar, its zone on Cloudflare; `www.ozimut.com` redirected to it by a Redirect Rule) and the
  former `ocn.kerkia.com` (CNAME at GoDaddy, kept for good: its pages send visitors on, « The move to ozimut.com »). Mail:
  the owner reads and writes `contact@ozimut.com` in **Proton Mail** (the domain's MX/SPF/DKIM are Proton's); the site sends
  from `alert@ozimut.com` through Resend (its SPF and bounce address on the `send` subdomain), replies to `REPLY_TO`
  (contact@); one DMARC record for both. **D1** database `ocn` (accounts, sessions, mail queue). **R2** bucket `cn-state` (the
  SQLite database and site data between CI runs). Free plans only: ~10 ms CPU per request (hence the light,
  peppered PBKDF2), 20 000 files per deployment (France's data ~11k files since `c/` was grouped on 2026-10-23: the competitions five to a
  file by id, `c/g<id // 5>.json` = {id: results}, meta `c_group`, `site_io.course_file` / `Courses`, `data.course`; a race
  opened reads ~15 KB instead of ~3. `r/` and `net/` stay ten runners' numbers a file: the runner page, Comparer, a club's
  members and the « Réseau » tab — 21 lists — each read several, and at //100 that tab would load 306 KB instead of 53),
  Resend 100 mails/day (beyond it Scaleway TEM, ~€0.25 per 1 000).
- Pages secrets (set by the owner with `wrangler pages secret put`): `SESSION_SECRET`, `RESEND_API_KEY`,
  `NOTIFY_SECRET`. GitHub repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `NOTIFY_SECRET`. Never ask for or print their values.
- **Deploy by pushing to `main`.** The workflow restores the state from R2, runs `update.py`, publishes, and
  saves the state back. Do **not** `wrangler pages deploy` from the PC: it would publish the PC's possibly
  stale `site/data`, and anything not pushed is overwritten by the next run.
- `site/_routes.json` keeps the public files (`/`, `/assets/*`, `robots.txt`, `meta.json`…) out of the Functions:
  served free and unmetered, without the login gate (which only passed them through); the data and the API stay
  behind it. The Workers free quota (100 000 requests/day) is **per account**, shared by O'CN and its `ocn-live`. **O'Cap** (`ocap/`, a public phone-first companion site, Pages `ocap` and Worker
  `ocap-live`, 2026-10-09) was switched off and deleted on 2026-10-18 (owner): its code, its Cloudflare projects, their
  deployments and stored data are gone; its live relay became O'CN's `live/` (it held no broadcast to carry over).
- **Open tabs follow a deploy** (2026-10-15): the pages' modules stay in memory for the whole visit, so a tab left
  open kept running old code after a fix. `update.deploy` writes `site/assets/build.txt` (`write_build_stamp`: a hash
  of site/ without data/ and auth/, unchanged by data-only deploys; git-ignored); `app.codeChanged` reads it at a change
  of page, at most once a minute, and reloads the page when it differs. No file on the local server: nothing happens.
- A push only triggers a run when it touches `site/**`, `functions/**` or `wrangler.toml`. A Python-only change is picked up by
  the next hourly run (it checks out `main`), or trigger it with `workflow_dispatch`.
- The GitHub repository is `kerkia/Ozimut` (`kerkia/CN` until 2026-11-09; GitHub redirects the old name).
- `gh` is not installed on the PC; read run status with the public API, e.g.
  `curl -s "https://api.github.com/repos/kerkia/Ozimut/actions/runs?per_page=5"` and `/runs/<id>/jobs`.
  Data on the live site needs a login, but `/data/meta.json` and the JS assets are public: use them to check
  a deploy (e.g. `meta.json` → `methods`, `normalisation`).

## Local development

- Dev server: `npx wrangler pages dev --port 8788` (local D1 under `.wrangler/`). `.dev.vars` holds local
  values (`DEV_ECHO=1` echoes mails instead of sending, `REGISTRATION_OPEN=1`, `SITE_URL=http://localhost:8788`,
  local `SESSION_SECRET`/`NOTIFY_SECRET`). Create a local test account through the register flow.
- Site data for the dev server comes from `site/data/`, built locally: `python -c "import build_site;
  build_site.main(['--out','site/data/fr','--db', <db>, '--auth', <a folder>])"` (France's folder; `--auth` keeps a test
  build's login index away from `site/auth`), then `python -c "import countries; countries.write_index()"`. Test engine changes on a **copy** of
  `C:\kerkia\Ozimut\data\ffco_results.sqlite3`, never on the original.
- To stop the dev server on Windows, kill `workerd` and the `node` processes running wrangler. wrangler 4.157.0 (2026-11-03)
  crashed workerd on the PC (« access violation »): launch config `pages-dev-admin-4156` (8796) pins 4.156.2.
- **workerd « access violation » on every Function request** (static files fine; 2026-11-09, the new PC, wrangler 4.159.0
  and 4.156.2, Node 26 alike): a **corrupt local SQLite file** under `.wrangler/state/v3/` — that time the observability
  trace store (`observability/miniflare-wobs-trace-store/*.sqlite`, 53 MB, « database disk image is malformed », written on
  every request), damaged by Proton Drive syncing the folder mid-write (its « Edit conflict » copies beside it). workerd
  crashes instead of reporting the error. Check each `.sqlite` there with `pragma integrity_check` (on a copy) and move the
  bad one's folder out of `state/` — miniflare starts it afresh; the trace store holds nothing the site needs, the D1 folder
  holds the local test accounts. Not the Visual C++ runtime, nor Node, nor wrangler's version; the 4.157.0 crash above was
  probably the same. A minimal Pages project with `--persist-to <empty folder>` tells the state from the code.
- After a JS change, check the page in a browser (console errors!) before pushing; the browser may cache
  modules — hard-reload.

## The CN methods

All methods share the race score: circuit value = mean of (CN J-15 × time) over a sample of the ranked runners holding
a CN (FFCO: the arithmetic mean over the fastest ⌈2N/3⌉; the published Top since 2026-10-16: the arithmetic mean over the
fastest 90 % in forest, ⌈2N/3⌉ in sprint, 75 % in VTT and ski — `CnParams.sample_fraction` per terrain; the geometric
analysis pair: a geometric mean with the tail dial, `cv_power` 0, `tail_k`); score = circuit value ÷ time; PM / abandon /
disqualified / over time score 0 and count.
12-month window. Four specialités, each ranked separately: forest (`For`: LD/MD/Nuit), sprint (`Spr`), VTT
(`VTT`, all formats together) and ski (`Ski`, all formats together) — FFCO's own split (`specialite=` on its
CN pages). In the DB `competitions.terrain` is "Forêt", "Sprint", "VTT" or "Ski"; the site uses the codes.
VTT (~30 competitions a season) and ski (2-4, on one or two weekends) have their own Fit/Top params
(`CnParams.by_terrain`, `for_terrain`; `meta.methods.*.params.by_terrain`, `cn.paramsFor` in the browser):
window 2 years (VTT) / 3 years (ski), best 70 % — with 12 months, too few riders held a CN to value the
circuits (VTT: half the circuits, 5 of 83 in 2021; ski: nothing after 2013). The official window stays 365 days.

**Since 2026-10-19 (owner) the published method « Top » is the « méthode Ozimut »** (key `top6w` unchanged in the code and
the data) and **the geometric pair is gone** (ENGINE 13; `fair3`/`top6w3` below are history). Words (`docs/i18n/glossary.md`):
« classement Ozimut » / Ozimut rank, « indice Ozimut » / Ozimut index (a runner's value, was « CN Top »), « score Ozimut » /
Ozimut score (a runner's points in a race), « valeur Ozimut du circuit » / course's Ozimut value; « CN officiel » unchanged;
French elides (« d'Ozimut », « de l'indice Ozimut »). **A text about the value of the method shown follows the method**
(owner, 2026-10-19): it uses the placeholders of `ui.cnWords` — `{cn}`, `{cnLow}`, `{cnOf}` « de l'indice Ozimut », `{cnPl}`
« indices Ozimut », `{cnS}`/`{cnSCap}` « indice » / « CN », `{cnTo}` « à l'indice », `{cnThe}`/`{cnTheCap}` (i18n `cn.<method>.*`) —,
which `t()` fills from the site's method when the caller gives none (`i18n.setDefaults`, registered by app.js); table
columns and chart axes use `col.cn` / `chart.cn`; never « CN » written in the code. Texts about FFCO's own CN keep « CN »
(« Compte pour le CN », « Coureurs au CN »); those about both methods name both (« scores, CN et indices provisoires »).

1. **`official`** — FFCO's published values, copied verbatim (before 2026 FFCO had one pooled pedestrian
   ranking for forest and sprint, filed under "Ped": `build_site.official_terrain`, `data.snapTerrain`,
   `data.inSeries`; VTT and ski always had their own). The runner page's official calculation card reads FFCO's own
   CN page live (`/api/ffco-cn`): FFCO re-evaluates past-season races under **new circuit ids** that only that
   page links, so its points can differ from the race's results page.
2. **`fair`, « Méthode CN « Fit »** — the **usual level** (analysis method; it values the circuits). CN = weighted mean of
   the best 60 % of the window's scores (`top6_weighted` with an unlimited number of places). Weights by competition **name**
   (`cn.title_weight`): "Championnat de France" 2, "O'France" or "Nationale" 1.5, anything else 1 (Sélection races and
   Championnats de Ligue included, FFCO's A/B/C/D level not used). ≥ 2 races for a CN (3 until 2026-10-23, ENGINE 14), a
   circuit needs ≥ 4 ranked CN holders.
3. **`top6w`, « Méthode CN « Top »** — **the method published since 2026-10-16** (owner: a method everyone can follow by
   hand, at a cost of a few hundredths of a point; ENGINE 11). **Derived from `fair`** (`CnEngine.derive`): same race scores,
   circuit values and recalage factors; the best 60 % scores fill **6 weight places** from the best down, the last race only
   for the places left, in a weighted **arithmetic** mean. Racing more can only raise an adult's once the places are filled.
   **The juniors' races fade** (owner, 2026-10-19; ENGINE 12; `CnParams.junior_fade` 1.0 on `fair`, so on the Top and on the
   usual level that values circuits, 0 on the geometric pair): a race run in a junior category (H/D 12-20, `cn.is_junior` on the
   race's own category) keeps its places but weighs × (1 − its age / the window) in the mean, read on the day the CN is computed
   (`cn.fade_factors`, floor 1e-3; `RunnerHistory.add(..., junior)`, every history the engine, `prov/compute.py` and
   `build_site` build; `cn.js` `explain`/`topWeighted`/`isJunior`, the runner page's calculation shows the factor). A junior's
   CN therefore moves between races, and a recent junior race below the older ones' mean can lower it. Study of 2026-10-19
   (private artifact https://claude.ai/artifact/4QztRsFZh8siyimuLvYiGa; scratch `rvar.py`, 17 curves from 2010 on the
   2026-10-09 database, CN J-15 read on its day, against production read the same way, 2012-2024): forest +0.18 [0.16, 0.21]
   (15 of 15 seasons better, +0.14 since July 2025), sprint +0.11 [0.05, 0.17] (ns since 2025), VTT +0.15 (+0.28 since 2025);
   every runner's races fading ≤ +0.08 and nothing once the juniors' fade, a 24-month window −0.6, the Top alone −0.08; junior
   bias in forest +2.3 → +3.9 (sprint and VTT better). MTBO would gain more with adults fading over its 24 months and juniors
   over 12 (+0.41): not taken. `study.json` `jeunes`. Circuits:
   FFCO's arithmetic mean of usual level × time over the fastest **90 % in forest, ⌈2N/3⌉ in sprint, 75 % in VTT and ski**
   (all four when only four, FFCO's exception kept; `build_methods` `fair.by_terrain`). Recalage: the geometric pair's
   (`norm3`: anchored on the Top's cohort, the drift corrected, calendar months, carried 10 months). **Study of 2026-10-15/16**
   (copies of the migrated DB of 2026-10-15, `C:\kerkia\Ozimut\work\study`: variants F50…F100, F90, E50…E100 by the scratch
   `run_variant.py`/`worker*.sh`, evaluations `eval_frac*_n.json`, `eval_elig_n.json`, `eval_switch_n.json`; the public numbers
   in `site/assets/study.json` key `lineaire`, built by the scratch `switch_json.py`; the database copies and variant exports
   of every CN study were deleted on 2026-10-17, the evaluations — `eval_*.json` and the logs — kept in the study folder): one criterion per discipline — the best
   duels on 2012-2024 without a significant loss since July 2025. Against the two-thirds (written 0.6666667 in the variants: one
   runner more on circuits whose size divides by 3; production uses the exact 2/3): forest 75 % +0.10, 85 % +0.33, 100 % +0.34,
   and **90 % +0.08 [+0.05, +0.10] over 100 %** (national +0.12, 8 seasons better, 1 worse; the owner's suggestion); sprint
   nothing beats the two-thirds (50-60 % win since 2025 but lose on 2012-2024, 100 % −0.34); VTT 75 % +0.15 (85 % +0.20 on
   2012-2024 but −0.49 since 2025); ski as VTT. The usual level's share of best scores (the owner's question): 60 % stays (forest
   50 % −0.03, 70 % −0.11, 80 % −0.16, 100 % −0.62; sprint 50-80 % equal). Against the geometric Top, same runners, 2012-2024:
   forest +0.02 [+0.01, +0.03] (national 0.00, since 2025 −0.02 ns), sprint −0.12 [−0.18, −0.07], VTT +0.10 [+0.03, +0.16].
   The production run (migration on a copy, `evaluation.json` of 2026-10-16): Top − official forest +2.17 [2.06, 2.27]
   (79.19 → 81.35 %), sprint +2.27 [1.98, 2.56] (81.16 → 83.43 %); geometric − Top forest −0.02, sprint +0.15 [0.10, 0.20].
   Published level (best 20 % of CN Top, snapshots of March and September 2018-2026): mean distance to 5600 2.0 % forest,
   3.4 % sprint, 1.0 % VTT (peaks 6-9 % after the Covid seasons; the geometric pair alike: 1.9, 2.8, 0.9 %) — « within 2 % at
   every date » said of the geometric pair held only at the dates first checked.
4. **`fair3` and `top6w3`, the geometric pair — removed on 2026-10-19 (owner; ENGINE 13: its data dropped, the race files'
   columns 27-36 and the `c/` columns 12-15 gone, `cn.circuit_value`'s tail dial gone; the study and the white paper keep one
   line: forest −0.02, sprint +0.15 [0.10, 0.20] against the published method, set aside for simplicity)** — the Top published **from 2026-10-13 to 2026-10-16**, an analysis method until 2026-10-19
   (labels « Fit géométrique » / « Top géométrique »): the circuit valued by a **geometric mean** with a dial on the slow tail
   (`CnParams.tail_k`, `cn.circuit_value`, mirrored by `cn.js circuitValue`: V = A^(1-w) x B^w, A = the fastest ceil(2n/3)
   times the discipline's usual tail effect `tail_mean`, B = the whole field, w = n / (n + k); forest 0, sprint 400, VTT and
   ski 50), the usual level `fair3` a **cubic mean** (`cn_power` 3), the Top `top6w3` the weighted arithmetic mean of its 6
   places. Its study (2026-10-13, private artifact https://claude.ai/artifact/1JSufP7jr3c9peCdSUwBuC) found what still holds:
   FFCO's two-thirds leave out the runners who made mistakes (the value 4.8 % too low on average in forest, unevenly: sd 5.4
   points, the junior circuits most), so the share of the field is what separates the methods; the geometric mean itself adds
   nothing in forest and a tenth of a point in sprint. Also measured there and rejected: the Top as its own circuit valuer (the
   loss grows over the seasons), an elasticity per circuit, per-race information weights, a bent score, the maximum-likelihood
   level, Huber's circuit value, k = 4; the study's engine options are kept in git history (commit 9244b54).
   History: `fair2`/`top6w2`, the quadratic pair (2026-10-07 to 13), dropped; `top6w3` cubic on 2026-10-13, arithmetic from
   2026-10-14; the four disciplines on one rule from 2026-10-14; the dial from 2026-10-15.

**Who sees what**: everyone sees `official` and `top6w` (« Ozimut ») and nothing else since 2026-10-19: the usual level
`fair` values the circuits and is shown to nobody, and the `analyst` right is gone (its admin checkbox and `store.setAnalyst`
removed; the D1 column `users.analyst` stays, unread). Old links and saved choices naming `top6w3`, `fair`, `fair3` open
Ozimut (`store.js` `RENAMED`). Before: `top6w3` and the « Fit » methods were analysis methods for the `analyst` right.
The Top keeps its colour and dash whichever pair publishes it (`charts.METHOD_SLOT`, `build_site` `COLOR`). **The
documentation (page and PDF) never names the Fit** (owner, 2026-10-14: misleading): the circuits are measured from the scores
the runners present earned in their previous races, their « niveau habituel », a step of the calculation and not a ranking.
« A race more never lowers the CN » is only said with « once the 6 places are filled » (before, the CN Top is an ordinary mean),
and of an adult's CN (a junior's recent races weigh more than their older ones, 2026-10-19).
**The documentation was shortened on 2026-10-16** (owner): the study tab has six chapters (Objectifs, Le point de départ,
La mesure, Les choix et les variantes, Les résultats, La méthode retenue), the alternatives in a few lines each, the
conclusion on simplicity and accuracy; old `?voir=score|circuit|recalage|ecartes` links open « choix »; the white paper
(`docs/whitepaper/methode-top.tex`, `figures.py` → `fig_trunc.pdf`, `fig_share.pdf` and `numbers.tex`, the numbers from
`study.json` and the live `site/data/evaluation.json`) follows the same plan.

Key design decisions (each was measured — see "Evaluating" below — and agreed with the owner):
- **Circuits are valued with the Fit CN, never with Top's.** A capped best-of fed its selection back through
  circuit values: groups racing mostly among themselves (veterans, juniors) inflated, H21 deflated (~13 %).
- **No fallback on a runner's first official CN** after the archive's first season (`seed_until="2011-01-01"`):
  it was stale and on FFCO's scale, and valued a third of sprint circuits. Only runners with their own CN in the
  discipline value a circuit. Seeds are per ranking family (`cn_engine.family`: pedestrian, VTT, ski).
- **"nc" (non classé) result rows** take no part in anything (`cn.is_nc`): not in circuit values, not in the
  runner's results or statistics; the race page lists them as "NC". (PM/abandon *without* "nc" score 0 and count.)
- **Recalage**: no annual step. Each month a factor brings the mean of the best 20 % of CNs to **5600** (FFCO's
  2026 rule), per terrain, from the level 2 months earlier (13-month smoothing; the Top's CNs, carried forward by the
  ten-year drift — `norm3`, shared by both pairs since 2026-10-16; see method 4). The factor of a race is that of
  its **day**: straight line between monthly knots, each monthly factor reached on the 1st of the following month
  (`cn_engine.daily_knots` / `factor_on`). A race's published score = raw score × factor of its day, **fixed once,
  never revised**; the CN is the aggregate of those published scores (no factor at CN level), so an adult's CN only
  moves when a race enters or leaves the window (a junior's also as their races fade). Never explain method artefacts in the UI — fix the method instead.
- The CN J-15 shown for computed methods is the runner's **published** CN 15 days before the race (the engine's
  own `cn_j15` column is on its internal scale), **computed on that day** from the published scores (`build_site.cn_j15`
  → `agg_at`, since 2026-10-19; before, the last CN after a race within the window, which still counted races that had
  left the window since the runner's last race: production read on the day −0.12 point in sprint, +0.02 forest, +0.22
  VTT, measured 2026-10-19). The month-end snapshots were always computed on their day. Their last point is **the build day**
  (Paris, `build_site.paris_today`; owner, 2026-10-19 — before, the last race date of the data): a junior's CN fades by the
  day and a race leaving the window shows that day. A run with nothing new but a new Paris day rebuilds the current
  season's snapshots once (`update.day_point_due`, the first run after midnight) and deploys.
- The engine takes a circuit's rules (sample, mean) from its discipline's params (`pt(terrain)` in `run_method`,
  2026-10-13); `cn.js` mirrors `circuit_value` as `circuitValue` for the live page's estimates (`meta.methods.*.params`
  carries `sample_fraction`, `cv_power`, `cn_power`, per terrain).
- Rejected after testing: Top with 10 places (6 works once circuits use Fit), best 70/80 % pools for forest
  and sprint (re-measured 2026-10-06: −0.4 to −1 point), 5 races minimum (fewer circuit valuers, worse),
  2 races minimum (2026-10-07: +11 % ranked in forest, +38 % in sprint, and those runners' Fit CN still beats
  their official one, but −0.1 to −0.4 point on the pairs already ranked; the owner kept 3 — **adopted on 2026-10-23**
  (owner, after Spain's study: +0.67 there in sprint): re-measured on the method of 2026-10-19, the 2026-10-09 database,
  every result's index read on its day, 2012-2024, the results with an index +7 % forest, +71 % sprint (+35 % since July
  2025), +13 % VTT, the newly ranked still called better than by their official CN (Ozimut − official forest +2.47 against
  +2.31, sprint +2.73 against +2.28), on the runners ranked either way forest +0.05 [0.04, 0.07], sprint −0.09 ns (since July
  2025 −0.23 [−0.43, −0.07]), VTT −0.14 (−0.43); the scratch `fr_min2.py`, `C:\kerkia\Ozimut\work\study\min2\eval_min2.json`),
  feedback on the
  recalage (oscillates), distance-pooled sprint circuit values (pace not comparable across circuits).
  **Leaving out the runners far from the circuit's line** (study of 2026-10-18, private artifact
  https://claude.ai/artifact/WS7C7tMKsj7h7ZzezNCLvE; scratch `ovar.py`, 28 rules: by residual from the score line or a fitted
  line, one side or both, threshold or share, on top of or instead of the time trim, Huber, juniors or few-race runners not
  valuing): the fast tail's CN is really ~18 % too low, but one side only feeds back through the circuits (forest junior circuits
  +16-25 % above adult ones; −0.21 to −1.06 point), both sides lose in forest; juniors not valuing + both sides beyond the 2.5 %
  thresholds gains +0.29 in sprint and VTT but adds two rules for the flaw the juniors' fading treats: not adopted (owner,
  2026-10-19). `study.json` `ecarts`; the Documentation's « Les choix » has a slide on each study, the white paper a paragraph.

## The four modules and the three profiles (owner, 2026-10-30)

**Six modules since 2026-11-12** (owner): Arena, Stats, Coach, **Orga**, **Carto**, **Pixel** (`app.js` `MODULES`; `visibleModules()`
leaves Pixel to the administrators). **Orga is one page, the organiser's events** (`#/orga`, route `orgManage`, `pages/manage.js`;
« Gérer » of 2026-11-11 gone as a word, `#/gerer` still opens it; no menu, as Arena; title « Mes événements »): an event's tabs are
**Tracé** (first; owner, 2026-11-12: course setting is the event's too), Départs, Direct, Résultats, Analyse, Équipe — a relay Tracé,
Direct, Analyse, Équipe; a training Tracé, Analyse, Équipe. **The Tracé tab** lists the Tracer's events tied to the event
(`GET /api/tracer?event=<id>`, to the event's team: those whose meta `event` is its id or whose `race` is its competition — title,
who started it, the setting team's size, whether one is in it), « Ouvrir le tracé » (`#/orga-tracer?id=&ev=`) for its setters,
« Commencer le tracé » (`#/orga-tracer?ev=&nouveau=1`: the Tracer's new-event dialog preset to the event — `pages/tracer.js`
`forEvent`, its competition alone or the training's name and day — the event's id sent as `event`, the API checking the account is on
the event's team; `PUT { event }` ties or unties one). **The courses stay the setting team's** (owner's condition): the Tracer keeps
its own team, roles and encryption; the event's other members see only that a course setting exists, who started it, and are told to
ask for an invitation. The Tracer's page stays (`#/orga-tracer`, module Orga, out of any menu). **An analysis's OCAD files serve the course setting** (owner, 2026-11-12:
no second upload): the analysis's OCAD import has « Les rendre disponibles pour le tracé de l'événement » (ticked by default,
`shared.js` `imp.keep`), which keeps the courses file and its map with the analysis (`analyses/<id>/src-<i>`, `GET|PUT|DELETE
/api/analyses/<id>/source[/<i>]`, the organisers' alone, never the runners' or the visitors', deleted with the analysis; an import
replaces the set); the Tracé tab then offers « Commencer le tracé avec les fichiers de l'analyse » (`#/orga-tracer?ev=&depuis=analyse`:
`tracer.js` `analysisFiles` hands them to the Tracer's import, preset to the event). Without them (an image map, the box unticked, an
import of before) the circuits are pictures only and the tab offers « Importer les fichiers des circuits » (`importer=1`). The
analysis tab drops its own title and day (`managePage`'s `embed`). **The event's page has no title** (owner, 2026-11-12): « ‹ Mes événements », the events'
chooser, the type, club and place, « ✎ Modifier » on one line; its tabs in the bar (`data-bar-tabs`, `app.placeBarTabs`: Orga's bar
holds `#nav` as Arena's). An administrator's « Tous les événements » is remembered (`localStorage ocn.mg.all`). **Ozimut Carto** (`#/carto`, route
`orgMapper`; `#/orga-carto` still opens it): « Cartographier » as a module of its own — a map outlives its events, mappers are not
organisers, and it works on a phone — every signed-in account, no Orga needed, in the map's contour brown (`--carto`); its editor's top line (the map's name, undo, redo, search, ⤢) sits in the site's bar on a computer out of full window, over the
ribbon in full window and under 900 px (`mapper/editor.js` `placeTop`; owner, 2026-11-12); a home-page
section (`tour.js` `carto`, no screenshot yet) and a column in the pricing table. **Ozimut Pixel** (`#/pixel`, route `virtually`;
`#/virtually` still opens it): « Virtually » renamed and out of Coach, in teal (`--pixel`); **every account's since 2026-11-12**
(owner), its Entraînement and Avatar tabs, and Analyse since 2026-11-14 — Résultats, Classement and Orga stay the administrators' (`pages/virtually.js`
filters the tabs, `app.moduleShown` no longer hides Pixel, `NUTRITION_ROUTES` no longer names it); no documentation
(its page explains itself: the documentation lists `DOC_MODS`, Pixel apart) and no home-page section yet. The modules page's cards of
one-page modules list what they offer (`hub.js` `STEPS`, `hub.<module>.step.<key>`); Orga's card is still hidden on a phone, Carto's
and Pixel's are not.

**Modules shown by need** (owner, 2026-11-12; migration 0027): **Arena, Stats, Coach and Pixel are the consumers' modules**, shown
unless the account hid one in Réglages › Modules (`users.hidden_modules`, « arena,coach »); **Orga and Carto are the creators'**,
shown only to the accounts that use them (`users.orga`, `users.carto`). `app.js` `CREATOR_MODULES`, `moduleShown(m)` (also Pixel to
the administrators, Orga never on a phone), `visibleModules()`. **Hidden never blocks**: a module's addresses always open (an
invitation, an e-mail's link, a bookmark) — `orgaOpen()` is any signed-in account on a computer, `orgaOff` only without an account or
on a phone. **Never hidden by themselves, shown by themselves** (owner: « no to auto-hide, yes to auto-show »): `functions/_lib/modules.js`
— `autoShow` (from `/api/account/me` and `accountView`: login, hand-off) looks once at an account's existing work
(`users.modules_checked` 0 → 1: `event_members`, `booking_events.created_by`, R2 `analyses-meta/` owner, `tracer-meta/` owner or
team → Orga; `mapper-meta/` → Carto), and `showModule(env, uid, m)` turns a module on as work is made (an event created or a request
to join accepted, « Créer les événements »'s members, a Tracer event made or invitation accepted, a map analysis opened, an
organiser's deposit, a competition declared, a booking opened, a GPS tracking link, a live broadcast → Orga; a map made or a
Cartographier invitation accepted → Carto); a module the account turned off stays off until such new work. The browser reads the
account again when leaving a page of a creator's module not shown (`route_`'s `hiddenCreatorWas`), so its menu appears. Where to
choose: registration's one box « J'organise des courses ou je fais des cartes » (`creator`, both modules; `orga` the form of
before), Réglages › Modules (`#/reglages?onglet=modules`: a box a module, the consumers' sent as `hiddenModules`), and the modules
page's quiet line under the cards (`hub.js` `quietLine`: « Vous organisez des courses ou faites des cartes ? » with « Afficher Orga »
/ « Afficher Carto », the hidden consumers' modules named with a link to Réglages; a visitor without an account is told they come
with one). Before migration 0027 the server sends Carto as Orga and no hidden module; a new account is checked at once (no work).

Ozimut is four **modules**, the same names in both languages: **Arena** (the competitions: coming, live, run — the map's
water blue), **Stats** (the rankings and their analyses — forest green), **Coach** (training: Analyse solo, Analyse multi,
« Définitions de postes », Jeux, VMA — the course's purple), **Orga** (the organisers' tools — the control flag's orange).
`app.js` `MODULES`, `moduleMenus()` (each module's menu), `moduleOf(r)` (a route's module; `ROUTE_MODULE` for the routes
outside the menus), `body[data-group]` = the module. The bar shows the current module's pages only (`.mod-nav`; folded behind
the menu button when they do not fit, `app.fitNav`), the logo and « Ozimut » (a link to the choice of module) with the module's name
under it (`.brand-mod`, in the flag's orange, a link to the module's first page, `moduleHome`; owner, 2026-10-30); the bar holds the menu only: the method switch sits at the right of
a Stats page's tab row (`app.placeMethod`, else alone above the page); Stats has no « Ma page »: « Coureur » opens one's own, its menu starts with « Classement » then « Coureur », the ranking's
first tab is « Liste » (owner, 2026-10-30), and Stats opens on « Classement », the page every visitor has (`moduleHome`; owner, 2026-10-30);
the contour lines are drawn behind the bar itself (owner, 2026-10-30, second review: no banner under it, no line describing the
module — the modules page says it). **The modules page** (`#/modules`, route `hub`, `pages/hub.js`) is where one lands — signed in or entered without an
account (`homeOf`) — and the logo leads back to it; it also signs out, signs in or leaves. On a phone (under 640 px) its modules are a
notebook's tabs over one card (owner, 2026-10-31: every module in sight without scrolling; `.hub-tabs`, the tab kept for
the visit in `sessionStorage ocn.hub.tab`). **No page leads into another module**
(the rule of the restructure): runner names in Arena's tables open the runner's window (`runnerpop.js`, as « En direct »'s),
Orga's pages name where things show (« Arena › En direct › … ») instead of linking, the analyses tag an organiser's own event
instead of linking to Orga. E-mail and notification links go straight to their page (allowed). The pages outside the modules
(Réglages, Documentation, Nous écrire, admin) keep the last module's menu (`sessionStorage ocn.module`); the modules page forgets it
(owner, 2026-10-31: Réglages and the Documentation opened from there showed an earlier visit's Orga), so they are neutral from there.
**One documentation per module** (owner, 2026-10-31): `#/documentation` is its home — « Le site », short, and a card per module —;
`?module=arena|stats|coach|orga` a module's, with that module's menu in the bar (Orga's greyed out, `.nav-off`, to those without
Orga) — a documentation page always looks the same whatever led to it (owner, 2026-10-31): the home has no module's menu — and
`.doc-nav` (« ‹ Documentation » and the four modules) to move about; the user menu's « Documentation » opens the current module's.
Arena, Coach and Orga's « Les outils » are `content/guide.*.js` (`arena`, `coach`, `orga`, `site`, `LEDE`), Stats' the methods'
tabs (CN officiel, Méthode Ozimut, Coureurs et clubs, and « L'étude »), Orga's « Le tracé » the methods' `tracerDoc`. A link of before
naming only `?onglet=` is sent to its module by `app.docAddress` (`DOC_TAB_MODULE`; the GPS analyses are Coach's).

**Three profiles**: a **visitor without an account** (« Entrer sans compte »: `auth.guest()`, `localStorage ocn.guest`; the
router keeps them to `GUEST_ROUTES`: Arena, Coach — Analyse multi only where its organiser opened it to visitors —, Stats' runner, ranking and races), a **signed-in account**,
and a signed-in account **with Orga** (`users.orga`, migration 0016 — at registration, in Réglages › Modules, or « Activer Orga »
on the modules page; `_lib/api.js publicUser` treats a database without the column as Orga for all). Orga is never offered on a
phone (`app.isPhone`: coarse pointer and ≤ 900 px; an Orga address shows `orgaOff`, hub.js; the modules page has no Orga tile
there, and its bottom line no « Se connecter », which the bar has — owner, 2026-10-30). Adding a trace to Analyse multi needs an account.

**Public data for visitors** (`data.setPublicRule`, set by `app.start`): a visitor, or an account that has not joined a country
whose access is "members" (France), reads its **public copy** `data/<cc>/pub/` (`site_public.py`, written by `build_site` for
France after `site_extras`, and once by any run if missing — `update.ensure_public`): the races from the first season FFCO shows
without a login (`countries/fr/public_period.py`: the season listing's « réservée aux licenciés », checked monthly by the
regular runs, `engine_meta` `ffco_public_from` / `ffco_public_checked`; 2024 on 2026-10-30), runners.json (those with a race in
the period or ranked in its snapshots, counts recomputed), competitions.json, c/, r/ (a hundred numbers a file, meta `bucket`
100), snap/ of the period's seasons, agecurve.json, meta.json (`public_from`). Agenda, evaluation and validation stay the
country's own files (`data.js SHARED`). The pages read from it (`data.isPublicCopy()`) hide the long-term tabs (runner: only
Courses and Calcul; ranking: no Progressions); the other Stats pages show `needCountry` (« create an account and join France »).
The login gate (`_middleware.js guestMay`) lets a request without a session GET the public copies and `DATA_FOR_ALL`, the
countries whose access is "all" (Spain, the agendas' countries; `auth.sees` is true for them without a session too), the live
results (`/api/live/list`, `/ws/*`) and `/api/tracking` (its GET serves visitors, `mine` false). Not excluded in `_routes.json`:
every visitor's request goes through the gate, which judges the decoded path, and counts on the Workers' daily quota. **The guest
pass** (owner, 2026-11-01: those reads were open to any script, unlimited): `guestMay`'s paths are served to a request without a
session only with the cookie `ozg_pass` (`{ g: 1, exp }` signed with `SESSION_SECRET|guest`, 12 h, `_middleware.js` `guestPass`,
else 401 `{ error: "guest" }`), which `POST /api/guest` gives after Cloudflare Turnstile (60 an hour an address); the browser
(`guestpass.js` `ensurePass`) takes it on « Entrer sans compte » (`app.enterAsGuest`), before each page of a guest's visit when
under half an hour is left (`ocn.guest.exp`), by a timer, and again on a refusal (`cnx:unauthorised` → `passRefused`, once a
minute; none to be had ends the visit); the widget is invisible unless Cloudflare wants a click (`.guest-check`, « Vérification
anti-robot »). Without Turnstile's keys no pass is asked. **Robots** (`site/robots.txt`, same day): search engines the home page
only, AI crawlers and assistants nothing (each named), Cloudflare's content signals `ai-input=no, ai-train=no`; the rules forbid
using the site's content for AI. Cloudflare's « Block AI bots » is the zone's setting (owner's); not Bot Fight Mode, which would
challenge MeOS (`/api/live/mop`) and the CI's `/api/notify`.

**Arena** is one page, the competitions (`#/agenda`; owner, 2026-10-30, third review): one list of today's, the coming and the
past competitions — the Agenda's events and, from the provisional index, the last 60 days' races (`pastEvent`, an event of the
agenda's last days that « Résultats » has drops for its row) —, chosen by three boxes in a box of their own above the filters, always shown — on a phone too, where the other filters are
folded (« Aujourd'hui », « À venir », « Passées » — « (60 jours) » dropped on 2026-10-31, owner —; `st.when`, all three by default;
the list opens on today with the last past competition above it, placed again once the box has settled). **On a phone** (owner,
2026-10-31) the three boxes are on one line, « Filtres » (opening over the list, a tap beside it closes it) and the country's
drop-down (`country.hint`'s `.cty-cur`, « Choisir un autre pays » hidden there) share the next (`.agenda-bar`), and the list scrolls
in its own box under them so that they stay in sight; the space under the bar's line is the space its buttons have above it.
A phone's bar has back and forward buttons on every page (`.hist-nav`, greyed where the Navigation API says there is nowhere to
go), in place of the race pages' « ‹ Compétitions » (`.arena-back`, hidden there). **Coach and Orga open on tiles, Stats too on a phone** (owner,
2026-10-31: every choice in sight at once; a computer's Stats stays on « Classement »): `moduleHome` leads to `#/coach`, `#/orga`,
`#/stats` (route `modtiles`, `pages/modtiles.js`, `app.tilesModule`; Orga's gated as its pages), one tile a menu entry with a line
of its own (`mt.<key>`); « Jeux » likewise opens on one tile a game, on every screen (`games.js`, `?onglet=` opens it). The results page has no circuit title over
its table: the circuit's selector says its name and runners. Each row's ground
says its period (owner, 2026-10-31): the past in the water's wash, today in the flag's, the coming in the forest's (each theme's
own `--water-wash`, `--flag-wash`, `--forest-wash`; `tr[data-period]`), the three boxes carrying the same colours as a legend
(`.when-sw`); hover and selection darken the row's tint and mark its first cell. Left for a race (a row, a
link of the details), the list remembers where it was (`agenda.js` `memo`: periods, the other filters — since 2026-11-05 —
and scroll, an hour, the same country; another country picked keeps the periods and the filters that are not places — `carried`,
noted on « ocn:country », which the header's menu now sends too, owner 2026-11-05): coming
back — a race page's « ‹ Compétitions » (`arena.back`, on the results page and the analysis), the browser's Back, the module's
name — finds it there; an address naming an event or `periode` opens as asked (owner, 2026-10-30). The map draws the coming
competitions as dots, today's and the past ones only while the mouse is over their row or they are selected (`agendamap.show`'s
`ghost`; a past race's place from the results index's `pos`, `prov/run.race_pos`: its place within its organiser's département
by the offline place tables, else that unit's centre). Arena offers no choice of ranking (owner, 2026-10-30: Stats' alone; « En direct »'s race page lost its button): its
tables show **Arena's own ranking method**, chosen in Réglages (owner, 2026-10-31: « Classement utilisé dans Arena », for an account that sees France; `store.arenaMethod` / `setArenaMethod`, kept in `cnx.state` beside Stats' `method` and taken from it the first time; `store.pageMethod` fills the `{cn}` words with Arena's in Arena — the results page, « En
direct », the runner's window: `provisional.js`, `live.js`, `runnerpop.js`). Arena has no menu: a race's
page puts its own tabs in the bar (`app.placeBarTabs` moves the page's `[data-bar-tabs]` — the results page's `raceTabs`,
`splits.js`'s `#sp-tabs` — into `#nav`; folded behind the menu button when they do not fit). **On a phone** (≤ 760 px; owner,
2026-10-30: the bar's folded menu stayed open, came twice, would not close on a tap beside it) a race's tabs and Stats' pages are a
menu in the page instead (`app.pageMenu`): its button before the race's name, or before a Stats page's tabs, the current tab or
page written on it; a choice, a tap elsewhere or Escape closes it; the bar's menu button goes on those pages (`.pm-on`). A race's
page on a phone drops the line under its name (`.race-head .lede`); Stats' CSV exports are not offered there (`.csv-btn`). **The country and the language on a phone** (owner, 2026-10-31: room in the bar) are sections of the top-right menu (`.menu-subs`: `country.subMenu`, `app.langSub`, each opening in place), not buttons of the bar; the theme stays in the bar. Visitors without an account have that menu too on a phone (`.visitor-menu`: country for a guest, language, the modules page, Documentation, Nous écrire, sign in for the signed-out, create an account); `country.hint`'s « Tous les pays » opens it at its country section. **The
source is Ozimut's choice** (owner: « users don't know better »): the results page and the analysis show the best document
(`run.doc_priority`'s order) and offer the source selector to administrators only; the circuit selector has no « Circuit » /
« Catégorie » label (« Voir » says it), and no « Temps intermédiaires de ce circuit » button: the race's tabs carry the circuit
shown (`data-view`, `raceHref`). On the modules page a module's whole card opens it, as its button does (owner, 2026-10-31: `.hub-card.go`, its name's link
stretched over the card, its page links and buttons above; a tap on a phone's tabbed card too, the hover tint with a mouse only). A past row
opens its results page (`#/resultats?course=`); a coming or today's one its details beside the list. `#/resultats` (the old list)
leads to the competitions with « Passées » ticked (`?periode=passees`), `#/direct` to the competitions (a race's live page
`#/direct/<id>` stays), `#/analyse-course` without a race to « Passées ». Desktop layout: the filters (with the runner,
`raceFilters` `fields: ["runner"], bare`, inside the same card) and the list on the left, the map and the details on the right
from the top. A live race of today whose name fits an event becomes that event's « direct » (`findLive`); no box of live races
(owner: not useful). An event's details start with one row of buttons (`actions`: invitation, « Suivre en direct », its
provisional results and analysis, GPS tracking, the start list, « Accès » — the way there; the access text is a line of the
details). The map has no frame of its own: its buttons and legend over it (`agendamap.js`; past rows are not on it). The modules page's Arena card lists what a competition chosen
there offers (`hub.js ARENA_STEPS`: agenda, results, live, split analysis — the GPS analyses are Coach's) instead of page links. A race's page (`#/resultats?course=`) has the results as its first tab, then — when it
has split times — every view of the analysis (`raceTabs`; `splits.js` draws the same bar with the results as a link,
`SPLIT_VIEWS`); `#/analyse-course` without a race leads to « Passées ». An event under way shows, beside « En direct », « Résultats
provisoires et analyse »: the organiser's list once there, else the live times when `livesplits.probe` finds split times.
**Coach**: **« Analyse de carte »** (`#/analyses` since 2026-11-07, owner — `#/analyse` being Arena's race analysis; `#/analyse-carte` before, still opened and written as the new one by `mapanalysis.render`; route `mapAnalysis`, `pages/mapanalysis.js`) is Coach's one menu entry for
the GPS analyses. **Since 2026-11-04 (owner, second design: « the first thing the page must show is the list of open events »)** it
opens on the events whose organisers opened a map analysis (a circuit at least; competitions and trainings, `/api/analyses`, `/v` for
visitors): filters Période (3 mois | 12 mois, the default | Tout; `?per=`), the site's country (`country.hint`; an analysis's `cc` — a
competition's race's country, a training's creator's site country sent at creation, `country`; none = every country's list), Type
(`?type=race|club`), « Club organisateur » (`?club=`, the analysis's `orgName`: a competition's race's `org`, a training's creator's
club as the results write it, `_lib/club.js clubLabel`), a search (`?q=`); columns date, event, type, club, circuits, runners (traces
shared, test traces apart; an event open to its club's members only tagged « Membres du club »,
`clubTag`; a training's club is its creator's, named from `meta.json`'s `names.clubs` — `_lib/club.js clubLabel`, whose runner rows
give « 7707IF »; a training stored without it named again at the first list, 2026-11-05); **the organisers set the club shown** (owner, 2026-11-07: an analysis open by code need not name a club): « Club affiché » in the analysis's settings (`sh-s-org`, PUT `orgName`, `orgSet` kept with it and in the summary), changed or cleared — the catch-up then never names it again, and a competition's race no longer fills a cleared one; the country's map beside it (`agendamap.js`, a computer only); **a thumbnail** of the first circuit's map
under the mouse (`.ma-pop`) and in the chosen event's card: `analyses/<id>/thumb-<n>` (~480 px, the course drawn, WebP ≤ 400 KB;
`GET|PUT /api/analyses/<id>/thumb/<n>`, the visitors' `/v/<id>/thumb/<n>`), made by the organisers' browser — `shared.js
courseThumb`, the organisers' page making those missing (`thumbsDue`, from the analysis's `thumbs`) — and dropped by the server when a
circuit's map or controls change; the list's `thumb` (the first circuit with one), `runners`, `upload`, `cc`, `orgName` come from one
listing of `analyses/` (`dataCounts`). A click on a row (or Enter) chooses the event and nothing more — no link in the list opens an analysis (owner, 2026-11-05: a name linked to the shared analysis was taken for the way in) —; its card, above the map, (`?id=`) offers three ways in, the thumbnail under them: « Voir avec tous les coureurs » (the shared
analysis), « Ajouter ma trace et comparer » (the same page with `ajout=1`: its track drop opens at once, `offerTrack`, a track handed
over taken by it), « Analyser ma trace seule sur cette carte » (**« Analyse solo » on the organiser's map**, route `analysisOrga`,
`#/analyse-orga?id=&c=`) — each as the organisers' switches `upload` / `solo` allow, the last two for an account; a password's event
asked in the card (the key in `sessionStorage ocn.an.key.<id>`). « Ajouter mon propre événement » (head) opens `#/analyse-solo`. The
four tiles of 2026-11-01 are gone, « Une compétition » with them (`?choix=` addresses open the list; `#/analyse?course=` stays
Arena's). **The race a track seems to be of** (`analysis.js` `findLikely`, `likelyBlock`; « Analyse solo » on one's own map): a track
just dropped whose day and place fit a race of « Résultats » (one the account is listed in, or its `pos` within 40 km) or an event
with an opened map analysis (its `pos` within 25 km) is offered in the files card: the race's published times (the files handed over
to `#/analyse?course=`, `pwa.handOver`; that page then matches the runner in that race only, `matchRace`'s pinned race), the event
with the others (`ajout=1`, the track handed over) or alone on the organiser's map. The shared map analyses were the administrators'
for a few hours on 2026-11-04 (cdc8cf9), every account's again since. An event's place: its race's `pos`, else the middle of its first circuit's map
(`/api/analyses` list `pos`, the summary's `centreOf` from the circuit's `geo`; an analysis saved before has its summary written
again at the first list, its `cc` and `orgName` too). The organiser's mode of `analysis.js` (`orgaMode`, `perso` true,
`pageMode` « orga », IndexedDB key `files:orga`; a competition's analysis reads its race's published results as tile 3 does —
`withTimes`, `loadOrgaRace`: the runner the address names, else the account's row, else the run that fits the trace, « — » for
none; the organiser's controls matched to the class's sequence by `published.matchControls`, the geometry kept and the clock
offset fitted on the split times —, a training's is read on the trace alone): the circuit chosen above the files, its stored map (`/api/analyses/<id>/map/<n>`,
never re-encoded), its controls in order and its `geo` (`files.orga`: `fitFromGeo`, nothing read on the map, `passesInOrder`);
only a trace is taken; a trace just dropped plays at once (`orgaGo`). Every analysis has « ‹ Analyse de carte » on top (`ma-crumb`,
`mapanalysis.backLine`; hidden during the playback and in full window); the runners' lists of Multi and `coachtabs.js` are gone
(`#/analyse-club` / `#/analyse-competition` without `id` lead to the list). « Définitions de postes »
(`#/definitions`, `pages/descriptions.js`; it and « Symboles de carte » shown only to the accounts whose last name
is Le Helloco from 2026-10-31 to 2026-11-10, **everyone's since, with « Apprendre »** (owner: its three tabs for all; `OWNER_ROUTES`
empty, the « .lim » texts and `auth.ownerKey` gone) — owner, 2026-10-31: `app.OWNER_ROUTES`, `auth.owner`, out of the menus, the router sends others to the modules page; the texts naming them —
the home page's Coach section, its picture and Tarifs line, the modules page, the tiles, Coach's documentation — have a « .lim »
version without them, `auth.ownerKey`, `tour.js` `lim` / `OWNER_CAPS`, the guide's `owner`): Purple Pen's symbols (`tracer/symbols.js`) column by column, column D by family,
a search, a practice mode hiding the names; Purple Pen credited in the legal notices. **Everything from the specifications and
only from them** (owner, 2026-11-04: the drawings of 2026-10-30, our own schematic maps beside every column, were not the
specification's, and the French showed English names): `iscd.js` — ISCD 2024 (the current IOF standard; its English text,
downloaded with FFCO's French 2018 translation, kept in the session's scratch `ffco/`) — gives each Purple Pen id its ISCD number
(`iscdRef`: Purple Pen keeps 2004's here and there, 11.x → 12.x, 12.x → 13.x, 13.x → 15.x…; radio/TV control and « map exchange at
a control », not in ISCD, and Purple Pen's second forms of one symbol are left out), and column D the map symbols of ISCD's own
« ISOM/ISSprOM » column (`MAP`, `mapCodes`: « a number includes all symbols beginning with it », 509 → 509.1, 509.2), drawn by
`isom.js` exactly as « Symboles de carte » draws them, with their numbers, each in a control circle at the map's scale
(owner, 2026-11-04: `isom.isomInCircle` — 703's ø 5.0 mm forest, 6.0 sprint; areas over the whole square, points and lines in
their swatch's band through its centre, `AREA`, `LIFT`; `mapSwatches`) — **the feature drawn with the symbol** where its shape matters (owner, 2026-11-04: « a Colline would show contour lines that draw a colline »; `isom.js` `SCENE` by ISCD number: terrace, spur, re-entrant, hill, saddle and depression in contours — the feature's own line in the symbol shown, the others 101, slope lines 0.14 × 0.4 OM —, quarry, narrow passage, lake, pond, river, marsh, firm ground, forest corner, clearing, thicket, copse, vegetation boundary, ride, pylon…: the specs' line widths, tags and fills along our shapes, areas cut to a shape with their edge, greens without the running-direction stripes, `PLAIN`); the other columns have no map
equivalent in ISCD, so none. Names and descriptions: ISCD 2024's (`cd.s.<ref>`, `cd.d.<ref>`; directional families from
`cd.cdir.<D>` / `cd.gdir.<D>` patterns, the description on the family's first card only); French from FFCO's 2018 terms,
the 2024 text translated faithfully; « Noms aussi en… » (`cd.lang`; « Langue des textes » until 2026-11-11, owner: it read as
the page's language) chooses none by default, else one of the symbol file's languages other than the site's, kept in
`localStorage ocn.cd.alt`: Purple Pen's name in it under each name (`cd.alt`) and the worked line in it. Column F's sizes and the instructions' distances, which Purple Pen draws as text, print ISCD's own examples
(`PRINTED`: 2.5, 8 × 4, 0.5/3, 2|3, 60 m…). Practice (owner, 2026-10-30): the names hidden (`?mode=pratique`), « Masquer les symboles »
(`?mode=carte`, the maps alone) or « Masquer les dessins de carte » (`?mode=symbole`; « Imaginer … » until 2026-10-31, owner: « Masquer » as the other choices), the rest shown by a tap. At the top,
« Lire une ligne de définitions »: our own worked line (`EXAMPLE`: 7, 145, the eastern stony depression 8×4, north part,
refreshments) under its letters A-H, written out in the language chosen by the Tracer's `textifier`, and what each column says
(C-H lead to their part). « Symboles de carte » (`#/symboles`, route `mapkey`, `pages/mapkey.js`, after « Définitions de postes »;
owner, 2026-10-31, after a legend of the kind maps print): every ISOM 2017-2 symbol (101-115, 201-215, 301-313, 401-419 — no 411
in 2017-2 —, 501-532, 601-603, 701-713) as a legend's swatch, group by group (= colour by colour), with its number, name and a
line of meaning; a card « Ce que disent les couleurs » with the forest's runnability by the green; search; practice hiding the
names (`?mode=noms`) or the drawings (`?mode=dessins`). `isom.js` draws them, our own SVGs at the specification's dimensions in mm
(line widths, dots, dashes, spacings read from its drawings), 18 px a mm, the course symbols in a larger frame (7.6 px a mm). Names:
the specification's (French: FFCO's translation, ISOM 2017-2 FR/EN; Spanish: FEDO's); notes the specification's own definition,
shortened, adding nothing (`ms.s.<code>`, `ms.n.<code>`; German translated from IOF's English, no official one found). **Every
drawing checked against the specifications on 2026-11-04** (owner: 206, the dots of 114/212 touching, 416's second form, 517's
ticks, « demi-courbe »): dimensions from their « précise définition » drawings, scattered dots placed at the spec's density and
minimum/maximum spacing (`scatterMM`, the sprint's `spScatter`), every variant the spec draws shown in one swatch (402/404, 406-410
with their running-direction stripes, 413/414, 416, 501, 520, 521, 202…); sprint from revision 6 (Czech) and the Polish 2019-2's
vector drawings. Left open: dimensions only drawn, not written (532's steps, the stripes' angle, 510/511's bars), 602 taller than the
swatch. Spec texts and the agents' notes kept in the session's scratch (`ffco/`, `forest-texts.json`, `sprint-texts.json`). The four
« shall not be crossed / entered » symbols (520, 708, 709, 711) are tagged « interdit ». **Two tabs** (owner, 2026-10-31): « Forêt »
(ISOM 2017-2) and « Sprint » (`?onglet=sprint`): ISSprOM 2019-2, revision 6 of January 2024 — read from the Czech federation's
translation, the only copy of that revision found (no English one reachable); its numbers (105.1, 501.1-3, 509.1-2, 512.1-3, 513.1-2,
522.1, 533, 710.1-2, 714, 715…) and dimensions at 1:4000 (`isom.js` `SP`, `SP_COURSE`, `GROUPS_SPRINT`; names `ms.sp.s.<code>`, the
FFCO's French of ISSprOM 2019 where it has them); `SPRINT_ONLY` tagged « sprint » (not on a forest map), `FORBIDDEN_SPRINT` the
symbols the sprint text says not to cross or enter. The standards, with their year, are named at the top of both this page and
« Définitions de postes » (`.ms-stds`; owner, 2026-10-31). « Définitions de postes » has the same two tabs: one IOF standard
(ISCD 2024) for both; « Forêt » shows ISOM 2017-2's symbols beside column D, « Sprint » ISSprOM 2019-2's and keeps the column D
features that have one, every other column whole (2026-11-04; the hand-picked sprint selections and the « sprint » tag are gone).
The file inputs of maps take any file on a touch screen (`util.fileAccept`: iOS greyed .fit and .tcx out); **a trace's** take MIME
types only there (`util.traceAccept`, owner 2026-11-06: a phone offered its photos for a GPS track — `application/octet-stream`, any
file, no image type: no photo library, no camera), and a touch screen gets buttons, never « Déposez … » (`util.touchScreen`): the map
analysis's « Ajouter ma trace » opens the phone's file picker at once (`shared.js pickTrace`), its first-visit offer a « Choisir ma
trace » button with « voir tous les fichiers » (no filter) beside it, Solo's files card « Choisir les fichiers » — not yet tried on a
real iPhone or Android phone; on a phone
« Analyse solo » offers « Photographier la carte » (`#an-cam`, `capture="environment"`: the rear camera, the photo kept on the phone).
**The home page** (owner, 2026-10-30): sections one under another, a rule between them, each a link of the bar — « Aperçu »
(Découvrir, Partout, Arrivée: what Ozimut is, phones, the pledges and the account), Arena, Stats, Coach, Orga, « Tarifs » /
« Pricing » (`#/?s=overview|arena|stats|coach|orga|features`); no sign-in buttons in the bar there, the login card under the
hero has « Se connecter », « Créer un compte », « Entrer sans compte » (`data-guest-enter`, `app.enterAsGuest`). Each section is a
course of its own (`tour.js` `mod`: the start triangle beside its introduction, its legs numbered from 1, its finish holding the
way in; the line's length measured to the finish, `--line`). « Tarifs » is a table, the modules as columns and the access levels
as rows (without an account, with one, with Orga), each row adding to the one above and marked « Gratuit pour tous »; each cell
lists what it adds (`CAPS`, the keys `tour.f.<module>.<level>.<n>` it names: change both together); what only a federation's
licensee sees (`<module>.fed.<n>`) has no row of its own since 2026-10-31 (owner): an asterisk in the row it opens from, the note
under the table (`tour.feat.note`) explaining it. A link
of the bar is caught by the page (`overview.onSectionLink`: a second click on the same one works too) and jumps to the section
under the bar, put right again as the pictures load (their sizes are written in the page) unless the reader has scrolled since;
on the home page the logo and the name take it back to its top. Stats' « Indice Ozimut » leg holds « Votre niveau sur la durée »
(`tour.method.long.*`: one set of rules since 2010, one scale with no jump between seasons, each race scored once — owner: the
index's value for following one's level over the years); Coach has an « Analyse multi » leg (`multi`, `multi-gaps`). The notes
on licensees and on the pictures sit under the Pricing table, one under the other, and are in the rules page too (« Accès et
images du site »).
Its pictures were all retaken on 2026-10-30 (the old ones showed the menus of before) on the scrambled copy rebuilt with that day's
code — `synth/oz2` (`synth-oz2.sqlite3`, `data/` in today's layout), by `build_oz2.py` / `build_oz2b.py`, then `tour2.mjs fr|en`
(Orga's pages on the administrators' dev server, 8790, so that their lists are full), `convert.py`, `sheet.py` for contact
sheets — kept in `C:\kerkia\Ozimut\work\scratch-scripts\C--kerkia-CO\7c7246a6-efbb-46e6-a267-01b8966734a0\scratchpad\shots`
(`npm install` there for puppeteer-core; run from PowerShell). New ones: `hub`, `past`, `descriptions`, `orga-direct`, `phone-hub`.
Retaken the same evening with the modules' bar, plus `multi` and `multi-gaps`: the local test analysis « Test UI club » (circuit
« Bleu », the reel's invented map; `multi` at 23:00, nobody followed, every runner's whole route in thick lines — `ocn.sh.prefs` tail 0, width 2.4 — so that the four routes and their variants show, owner 2026-10-31), whose title, organiser and runners `lib.mjs` replaces with invented ones
(`/api/analyses/<id>` and `/traces/<n>`, fetched with the page's cookies) — never take them without that. `past` must open in a
fresh page: an Agenda address opened from the Agenda keeps the page's periods. `stats-ages` retaken on 2026-11-02 (the pyramid's rows as tall as their
categories' years, its bars' areas their shares; `tour2.mjs` scrolls its card under the bar), the reel's `vPyramid` alike.

## Provisional results (« Résultats »)

Organisers publish results (and often split times) on race day or the next, days before FFCO. `ffco_scraper/prov`
collects them for the races of the agenda (upcoming ones are kept, with their website and place, since the agenda
drops past races) and of FFCO's last month — relays excluded — and `update.py` runs it after each hourly update
(`PROV_BUDGET` seconds, 240 by default), plus `--prov-only` runs every 20 min on Saturday and Sunday evenings (600 s);
a deploy only when something new was found — Pages' free plan counts deploys. A race is watched 14 days whether
FFCO has published it or not (FFCO has no splits); a finished race comes back when a platform competition is
newly matched to it. Sources: liveresultat.orientering.se (JSON API, matched by date + name/organiser), WinSplits
Online (sequential event ids scanned forward; HTML split tables, start times from the event's .spl file, an
undocumented format decoded and checked against the tables — `winsplits._spl`), Helga (helga-o.live's SplitsBrowser:
event titles by sequential number, the IOF XML list from `readsplits.php`; its `/webres/` pages answer robots "403"
and are not read — the owner is telling Helga's developer), MeOSDjango sites (2026-10-22, `sources/meosdjango.py`: a MeOS results site any club installs — Orientation Data, `heyries`, is one, COCS 73's jolatomme.alwaysdata.net another; each course read once from its JSON `/api/<cid>/course/<hash>/live/`, start times and splits by control code, the coming races' start lists too; `KNOWN` plus the sites met on a club's site — a `/competition/<n>/` link probed, or a page with its signature —, kept in `prov_meta` « meosdjango »; a course re-read only when the competition page's « classés / partants » change), O'Live (2026-10-24, `sources/olive.py`:
co-live.fr, a live results site French organisers feed from their timing software, HTML only — the races on offer, each
circuit's results page and split times page, read again only when the results pages moved; it lists only current races, so a
race is read on its day or soon after; a link to its home page on the organiser's site, « Résultats provisoires », gets the
O'Live race of that day whose name fits, or one of whose name's own words the linking page gives: `clubsite` keeps such a link
with its page, `contexts`, `OLive.of_day`; `SOURCE_RANK` 2; **O'Live's relays in « Analyse de course »** (owner, 2026-10-25: the CNE at Le Bessat, its splits
published on co-live.fr; relays stay out of everything else): `run.relays` makes each relay O'Live lists a race « olr<IdCourse> »
(epreuve « Relais », the organiser, place and site of the agenda's relay of that day; skipped by `races.sync`'s relay cleanup,
the merges, the club-site searches, the start lists and the platform matching), read by `OLive.read_relay` — one class per
category and leg (« RELAIS HOMMES · Relayeur 3 »), every runner of the leg, the team as their club, forked positions labelled
« 127/172 » and compared by position (the owner's choice: one circuit per leg, not per variant), places ranked from the leg
times (O'Live's leg « place » is the team's at the handover), « Ant » (a mass-started leg, kept once through) through when its
block says « Arrive » or the team has its handover total; no start times (the pages give none). Read again only when the
categories' pages move (7 pages; the read itself ~33), every 50 min on its day, once more the next day, then done. `build`
puts it in the index's `relays` (not `races`: not on « Résultats », no alert, nothing scored, no category view); only
`racelist.js` (tag « relais ») and `splits.js` (no « Résultats → ») read them; **a cancelled race** (2026-10-24: FFCO's calendar still listed both CF Sprint races, cancelled on the organiser's
site and replaced by « Sprint Labyrinthe - Le Bessat », and both took its results): a race whose organiser's pages hold a sentence
with « annul… », its name — brackets and « - WRE » apart — and its day (« samedi 24/10 » too) is marked cancelled
(`ClubSite.cancelled`, `run.mark_cancelled`, prov_meta « cancelled ») and left off « Résultats » while it has no results of its
own; an O'Live race its page leads to by the page's words only becomes the replacement, a race of its own « ol<id> » with the
cancelled race's day, organiser, site and discipline, O'Live's name and the place after its « - » (`run.replacement`), and the
cancelled race drops an O'Live document the replacement holds; **a cancellation stays once the race's day is past** (owner,
  2026-10-29: the organiser's notice taken down after the weekend brought the qualification back on « Résultats » with the
  replacement's O'Live document): `run.mark_cancelled` keeps it, and `run.cancelled_keys` also counts a race holding an O'Live
  document a replacement « ol<id> » holds and the organiser's other races of that day under the same name (qualification and
  final); the build drops such a document from any race but the replacement), SPORTident Center (2026-10-24, `sources/sportident.py`: center.sportident.com, where
SPORTident's Orienteering App, its Reader, OE12 and SiTiming publish, live and after; its public events list
`/api/rest/v1/public-events` by country and dates, each event's results file `/event-files/<guid>/results/r.1.latest.bin`, a
protobuf read by its field numbers — taken from its page's script, none of its code —: classes, courses and their sections,
entries with club, bib, birth year, card, each entry's result by section; asked again conditionally, 304 when unchanged; the
Center writes the local clock as if it were UTC; one list by course, `SOURCE_RANK` 4; a country's events matched to its own
races; « SPORTident … » or « Not assigned » as organiser counts as none — « SPORTident France » took a « Coupe de France »;
pid « <slug>?event=<id> », its page `…/results/orienteering/<slug>`; a club's link to it or to si.events read too; in France
mostly club trainings, 41 public events in 2026, a few league championships; the relay's `live/src/sportident.js`), an organiser's own broadcast (« Organisation › Direct » tied to the competition: `sources/broadcast.py`), and the organiser's site
(a short link text gets the heading it sits under — « Résultats SI » under « Régionale LIFCO, le 11/10/2026 » —, links
without an extension on file hosts or saying « Résultats / départs / Annonce » are read to find out, Cloudinary's addresses
kept in their stable form; WordPress media/posts API — a `*.wordpress.com` site through public-api.wordpress.com, and the club's other
subdomains met on the way, `new.co-lorient.fr` —, Blogger feed, up to 14 pages best-first across the whole crawl from
the race's page and the home page: pages naming the race (words, its day in any spelling, `2026/10/03` in an address)
before generic results pages, a multi-sport site's own orientation section before the rest, lists of past events,
`.html` pages visited too (Joomla); photo albums, other seasons' and other days' pages never; a subdomain's main site
too, `ocastor.go78.org` -> `www.go78.org`; redirects and meta-refresh followed). A page is « the race's » (its files
need not name the race) only when its title lines say results and give the race's day and no other day. A file named
for another day is never the race's, nor one printing another season in its title or a date before the race (up to
2 days after is fine: exports printed the next evening); an organiser's races of one weekend share its files out by
their own words, the title printed inside included (`races.owners`: « KO », « Challenge », « CL », « Chpt ligue »).
A place's compass point or qualifier (« Nord », « Saint », `races.QUALIFIERS`) is weak evidence when matching a
platform's competition (2026-10-17: « Seillon Nord » took Helga's Belgian « NORD#3 - Erpent »). FFCO's f-race and the agenda's x-race of the same day and organiser are merged (`races.merge_duplicates`, name words
≥ 80 % shared). Unreadable files a full look no longer finds are dropped. A post published in the 4 weeks before
the race (its address `/2026/09/24/…`: the announcement, often updated with the results) is visited, and its date is
not « another day »; on a page about the race's weekend, « MD »/« LD » in a link read as « moyenne/longue distance ».
A file whose name, link or printed title gives another format (« VTT » for a foot race, « LD » for an MD) or another
weekday (« Samedi » for Sunday's race) is not the race's (`run.not_this_race`), nor one whose address spells another
day (« …-dimanche-5-octobre-2025/ »; WordPress's `/uploads/YYYY/MM/` folder aside: `clubsite.address_other_day`).
PDFs: `pdf._dedupe` replaces pdfplumber's slow `dedupe_chars` (same output, ~4× faster on split lists). A file rejected on one race's look but about another race of the fortnight goes to that race (`run.adopt`: the race
whose place it names and whose day and format fit — the CF week's site posting Luxeuil's results). In `races.owners`,
names count with their abbreviations both ways (« CF LD » = « Championnat de France Longue Distance »), and a file
naming neither race goes to the plain one rather than an « Open », « KO », « Challenge »… A platform competition whose
name says VTT goes to a VTT race only, and a VTT race prefers one that says so (`match_score`). A race FFCO deletes
(published twice, one deleted) gives its documents to its twin and goes (`races.drop_deleted`); f-race names follow
FFCO's. A file already parsed (same content hash) is not parsed again for the weekend's other races (`run._PARSED`, then
`prov_docs.sha`). Club websites: FFCO's club directory first (`races.read_directory`: api.ffcorientation.fr's map,
`clubs.geojson` monthly and one popup per club, 40 per run — the number, the website and, since 2026-10-31, the contacts
(column `contact`, for « Annuaire »); table `prov_club_dir`), else the site the agenda gave for one of the club's events
(often the event's own: `prov_clubs`); the past month's races, dropped
by the agenda before the pilot started, were added from its CSV export (one request each time the window reaches
further back — `agenda_backfill_from`; the owner's go-ahead 2026-10-08, for September then August; `races.backfill`). Each run looks at the longest-waiting races first, the organiser's site before the
platforms (WinSplits' class pages only when its .spl changed); a race the budget cut short comes first next time;
the last runs are listed under the « Résultats » table. **Polite by design:**
our user agent, a pause per host, conditional requests, a few requests per race only around competitions.
**robots.txt is read but no longer obeyed** (owner's decision, 2026-10-09: low load, occasional reads): a forbidden
URL is fetched all the same and its site goes on the owner's follow-up list (`prov_blocked`, kind `robots`). Sites
that actively screen robots (401/403/429, an empty 200 to non-browsers, Helga's results pages) are **never
worked around** — no disguised user agent: recorded as refused and listed too (kind `refused`). The list
(`site/data/prov/blocked.json`, served to administrators only by `_middleware.js`) is the admin page's « Sites » tab,
with the races concerned, for the owner to contact the sites' owners. Livelox links are ignored altogether (2026-10-10:
only the runners who sent their GPS track, and closed to robots): neither a document nor on that list. WinSplits rows with
no time, no status word and no punch are non-starters (« dns »), with punches mispunches. A platform competition is stored under one address
whatever a club's page spells (`run.PLATFORM_URL`, `canonical_docs`: « …?lang=fr&comp=… » made duplicates); Helga links
that name no event are dropped. **A race under way** (2026-10-23, the Pélussin City Race: a MeOSDjango read at mid-race was
listed as complete): a list read from liveresultat or a MeOSDjango site while runners are still out or yet to start carries
`live` (`model.live_state`: how many, the next start, the latest finish; MeOSDjango's own `race_state` « finished » clears it);
`run.build` marks the race `ongoing` (index and race file: the number of runners out) while it is today, no organiser's file
(upload, the club's site) is there and the latest finish is under 90 min old or a start is still to come (`run.ongoing`,
`ONGOING_QUIET_S`) — the list tags it « en cours », its page says the results are partial, and `notify` holds the « mise en
ligne » alert until it is over. **A liveresultat competition goes to a race only in its country's time zones** (`races.assign`'s `accept`, `run.lr_here`;
2026-10-30: Sweden's « Halloween-Natta » had gone to Nouméa's « Kids Halloween » by the one word they share, and the Agenda offered
its live results): the time zone its organiser declared (`getcompetitioninfo`), none = Swedish, as the live relay's `countryOf`
(`timediff` cannot tell France from Sweden), overseas France counting as France (`FR_OVERSEAS`); a liveresultat document kept
before from another country's time zone is dropped. liveresultat's splits are kept when a class's « splitcontrols » cover the course (4 or more: MeOS feeds every
control, code 1000 + number, repeats 101031…; a radio control or two are not kept). A race's documents are
shown in the order `run.doc_priority` gives (`prio`, both sites follow it): uploads and the organiser's files, then
WinSplits / Orientation Data, Helga, liveresultat last (live results are not corrected afterwards); a document with
under half the runners of the fullest one drops. A split list without start times takes them, by name, from another
document of the race (`run.share_starts`, for « Groupes »). **Start lists** (2026-10-10): for the races of the next 7 days, the liveresultat
competition assigned to each is read every 6 h (`run.start_lists`, `LiveResultat.read(startlist=True)`: status
"start"); a coming race is not listed on « Résultats » (index `soon`, `startlist`, `agenda_id`): its start list is reached from « Agenda », and its page
shows start time, current CN Top / official and the expected place; « Agenda » shows a « Liste de départ publiée » box and a « départs » tag (today's races too). **Live results from the Agenda** (owner, 2026-10-23): the index gives a race of the last day on its `live` ids (`run.live_ids`: liveresultat's number, a broadcast's, a MeOSDjango site's « host/<n> »); an event under way whose live competition the relay lists, or whose tied broadcast sent something, gets a « Résultats en direct » box (« En direct en ce moment » and a « direct » tag in the list when its last punch is under the relay's `liveS`), linking to « En direct ». FFCO's public registration
list gives only the number of registrants per circuit (`agenda.circuit_counts`, races of the next 21 days, `reg.circuits`):
the names are members-only and not read. Organisers' sites too (`run.site_start_lists`,
`ClubSite.find(mode="start")`: files named départ / horaires / liste de départ / inscrits, posted in the 3 weeks before;
races of today to +7 days, 8 sites a run, each every 6 h): read by `parsers/startlist.py` (IOF XML StartList, HTML tables,
OE12 and MeOS PDFs by column positions and section lines; never by the results parsers: a start time is not a race
time) into kind "startlist", else linked (kind "startfile"); a sheet laid out as a grid — one time column, or one per
circuit, then a « name, club » pair per circuit, the circuits' names above (organisers' Google Sheets, 2026-10-17:
O'Bugey, SpOC) — is read one circuit per column pair (`startlist._grid`; merged cells expanded by `_cells`, « Hour » and
« N° Club » headings, a club number's lost zero restored), and its title lines are the file's `head`; a start list naming
another format or weekday is not the race's (`run.not_this_race`, as for results) and one kept earlier is removed; a weekend's files go by the days they print and their
first lines (`races.owners`, « SPRINT1 » split). The result pass leaves start lists alone; they rank after results. An organiser's new start list under another
name (« …-V2-… », 2026-10-22: the old one, a runner longer, ranked first and gave its old times to the race page and the
alerts) replaces the older one when it names 80 % of its runners, and a file a complete look at the site no longer finds
goes (`run.supersede_starts`). The agenda also keeps the list's rows of the last `RECENT_DAYS` (3) days (`recent`):
`races.sync` applies them, so a race-day change (CN or not, name, place, format, date) reaches the race once the agenda
has dropped it. **The announcement and the start-time booking on the organiser's site** (owner, 2026-11-11: COLE's
« Régionale LIFCO » of 6 December linked both from its own post, FFCO's page neither): `run.site_links`, after the results
in each run, looks at France's races of the next `LINK_DAYS` (60) days, `LINK_SITES` (4) a run, each every `LINK_EVERY` (36) h,
with `ClubSite.find(mode="announce")` (WordPress posts from 75 days before; a post or page about the race's day): the
announcement a file (PDF, Word, a shared drive) found on the race's page or post, else one whose name gives its day — a word
in common is no evidence (« liguepaca » took a youth camp's), nor an upload over six months older than the race, nor a page
(co-paca.info's season table); the booking a Google Sheets / Forms, Framaforms, Framadate, Doodle, Microsoft Forms… link whose
text or the words just before it say « horaire » / « départ » (`BOOK_LINK`, `BOOK_WORDS`). Kept in `prov_meta` « sitelinks »,
written to `prov/links.json` (and `pub/`) by agenda id; the Agenda shows « Choisir son horaire de départ ↗ » (unless Ozimut's
own booking is open) and the site's announcement when FFCO links none, both titled « Trouvé sur le site de l'organisateur ».
Their circuits' table is kept too (`save_announcements`). PDFs: MeOS's coded split list (`1 (54): 2:32 (2:32) …
Arrivée:`, CF LD 2026) is read with its control codes. Parsers
follow `prov/model.py`; bump `parsers.VERSION` when they improve (every known document is read again), and
`run.COLLECT_VERSION` when finding results improves (every race of the window is looked at once more, finished ones
too). A page or file up to 32 MB is read (`fetch.MAX_BYTES`); a file named for another year is not the race's
(`clubsite.other_year`), and a word of the club's own address does not name the race. WinSplits headers are kept
by date (70 days), not by number. No result
file carries licences: runners are matched by name + club number (`match.py`), unmatched rows stay unlinked.
Provisional scores reuse the engine's functions (`compute.py`): official = official CN J-15 and FFCO's rule;
Fit/Top = the base method's internal CN J-15, circuit value, raw score x the day's recalage factor; only lists by
circuit are scored — a list by category is scored circuit by circuit once its categories are placed (several share a
circuit): by the race's lists by circuit that give runners' categories (`run.category_circuits`), else by FFCO's public
registration list, whose « Catégories » column gives each circuit's (« B : D20/35, H40/45, Open violet »; kept as a
« registration » document by `races.save_registration` from the agenda's `reg.circuits`, expanded by
`races.expand_categories`), else by the course announcement's table when it has one (`parsers/announcement.py`:
the agenda's FFCO-hosted announcements, `annCircuits`, and those on the organiser's site found by the start-list search);
categories of unknown circuit stay unscored. Such a list also gets a view by circuit (`run.circuit_view`: categories merged,
places recomputed; the race page's « par circuit / par catégorie »); « by category » is decided at build time from the
classes (an older reading may say otherwise). The results pass keeps announcements too (races already run). A liveresultat read with a class answering badly (« Too many connections ») is dropped whole. State in the main DB (`prov_*` tables); output `site/data/prov/` (index + one file per race),
served to every logged-in user (an admin-only pilot until 2026-10-08). **Uploads** (2026-10-08; three steps since
2026-10-09; the organisers' alone since 2026-10-15, under « Organisation › Résultats »: `#/orga-resultats?course=…`,
the old `#/deposer` leads there and « Courses › Résultats » — the runners' — offers no deposit): « Déposer »
(`pages/deposit.js`, opened by `pages/orgresults.js` for a race of one's club, the race fixed) — 1. the file (IOF XML best, OE/MeOS
HTML, PDF, .zip/.gz; 30 MB), with what to export; 2. it is **read in the browser** (`localparse.js`, a port of the
server's iofxml / oe_html / meos_html parsers giving the same documents — keep them in step; checked identical on
real files) and shown: summary, results by circuit, and every « Temps intermédiaires » tab on it
(`#/temps-inter?course=fichier`) — nothing is sent; the parse sits in sessionStorage (`local.js`: gone when the tab
closes, cleared at logout; the File itself in memory only, to be chosen again after a reload); 3. only if the user
wishes, « Publier sur O'CN » (`pages/upload.js`): the race (those of the file's date first) or a race added with it
(name, date in the last 60 days, place, club, format; pre-filled from the file), consent, send. A PDF cannot be read in
the browser: straight to step 3. `functions/api/upload.js` streams the body to R2 (`cn-state`,
`uploads/<id>/` + `meta.json`; binding `BUCKET`, the Functions write nowhere else), records it in D1 `uploads`, mails
the administrators, deletes files older than 60 days, and, when the Pages secret `GH_DISPATCH_TOKEN` is set (a
fine-grained token, repo kerkia/Ozimut, "Actions: read and write"), starts a `prov` run (workflow_dispatch, at most
every 3 min); the workflow copies `uploads/` to `$CN_DATA_DIR/uploads`, `sources/upload.py` turns each upload into
a document (source "upload"; a newer one by the same account replaces it; added races get key `u<id>`). Every upload
is published (owner's choice); the admin page's « Dépôts » tab lists them and removes one (meta status "removed").
**Course data** (2026-10-15): X-Upload `kind: "courses"` (default "results") is a setter's IOF XML CourseData
(« Organisation › Tracer », Purple Pen; `.xml`, 5 MB, organisers only; a race of the list or a coming one of the agenda,
`a<agenda id>`), a document of kind "coursedata" (`parsers/coursedata.py`, 3.0 and 2.0.3) — no results list: not counted
or scored, no `org_races`, an account's newer courses replace its older ones (results apart). `run.fill_courses` gives
the race's lists the length, climb and controls they lack (« #3 » placeholders too) by course name (« Circuit A » = « A »),
circuit, class assignment or identical codes (a name so identified holds in the other lists; a category view takes its
circuit's values); nothing of it is used before the race's day, its courses listed from the day after. pages « Résultats » (`#/resultats`, « Récemment » until 2026-10-12, in the
menu « Courses » after « Agenda »; `#/recemment` and `#/provisoires` still work) listing the last 60 days' races (`run.SHOW_DAYS`; 30 until 2026-10-08), and
« Temps intermédiaires », now **« Analyse de course »** (owner, 2026-10-23: the analysis was buried under a race's page;
`#/analyse-course`, route `splits`, menu « Courses » after « En direct »; `#/temps-inter` still opens it): without `course=` it
lists the site's country's races of `prov/index.json` with split times, the latest first (`pages/racelist.js`: discipline,
« Mes courses seulement », search; « ma course » where one is recognised), each opening the analysis (`splits.js`: the race's
name as title, no link back to the list — the menu is it (owner) —, « Résultats → » beside it; no race selector any more; compact (owner, 2026-10-23): the circuit and club selects above the view tabs, a view's settings on one bare line, its explanations merged into one paragraph under it — `foot`; the list has no « Voir » column); « Voir » on « Résultats »
and the race page's buttons lead there. **Live races** (`course=direct-<race>`, `livesplits.js`): the live relay's classes
(`/ws/<race>`, subscribed `"*"`) read as one document of the provisional shape in the browser (`toDoc`: status 0 → ok, 9/10 →
« run », shown « en course »; the radio controls are the controls, code % 1000 when unnamed; nothing stored); drawn once the
class asked for has come, then new times of the course shown offer « Actualiser » (no redraw under the reader's eyes; the others'
are taken quietly). « En direct »'s race page shows « Analyse → » beside the race's name (owner, 2026-10-24: where « Analyse de course » has
  its way back to « En direct ») once a split time has come, and the list's box « En
direct, avec temps intermédiaires » lists the site's country's races live now whose live gives splits (`probe`: the relay's hello
— a last passing at a radio control — else one class read; 6 races at most, each connection closed at once). Its analysis — WinSplits' and MeOS's time loss (the leg against the runner's
usual pace, signed; since 2026-10-24, owner, `trace/legs.js` `refLegs`/`usualPace`/`legLoss`, shared with the GPS analyses: the
leg's reference is MeOS's — the mean of the fastest sixth after the winner, of the two best under 12 times, the best under 5 —
and the usual pace the runner's time over the reference times on the legs without a mistake, found from the median ratio then
refined three times; before, the best leg × the median ratio, which ran 7 % slower than MeOS's pace on the Le Bessat sprint and
lost 2 640 min against 3 030 for MeOS, 2 870 now; the views' « Rythme habituel » is the same legs over their best times); a mistake = lost ≥ 20 % of the leg **and** ≥ 10 s (both adjustable); « Perdu » and « Sans temps
perdu » count the mistakes only; the Tableau keeps two lines a runner, the gap on hover (owner, 2026-10-10: as
WinSplits) — on a screen without hover a third line in every cell (`.touch-only`, `@media (hover: none)`; owner, 2026-10-23),
and « Réel / Sans temps perdu » redraws without moving the table or the page (`keepPlace`); Écarts against the superman (best legs) of everyone or of the runners compared. **After MeOSDjango** (2026-10-22;
ideas only, its GPL code never copied): the **timing check** (`splitcheck.js`, pure: a class in, findings out — a negative leg at one
control for ≥ 2 runners = its unit or the previous one off the right time, alone = a card not cleared, a finisher without a control
the others punched = punched before the start, one code twice with one time = the source's fault, that control left out) on
« Déposer » step 2 (a card « Contrôle des temps ») and above every view of « Temps intermédiaires » (the cells framed in Tableau;
`provisional.clock` writes negative times « −11:17 »); three views (`splitstats.js`): « Passages » (clock time × control,
`charts.passChart`), « Autonomie » (« Lièvre / suiveur » until 2026-10-23, owner; pairs leaving a control within T2 = 20 s, compared along the leg with each one's progress
steady between controls: weight 1 under T1 = 7 s, falling to 0 at T2, both adjustable `?f1=&f2=`; the one passing later follows;
index = time behind − time in front over the race time; followed legs barred in Tableau), « Régularité » (index = the leg's mean of
its best quarter ÷ the runner's time; irregularity = its standard deviation weighted by the reference times over the runner's
mean index — the absolute one favoured slow runners; a leg's spread with each runner's level taken out; finishers with every split).
**Score races** (rogaines, owner 2026-11-04): a class is one when the race's format is « Score », its controls carry points
(liveresultat's « 206 (1p) ») or most runners skip controls and take the rest out of the list's order (`arenatabs.isScoreClass`); it
has only « Tableau » (each runner's controls in the order taken, with their points) and « Passages » (controls taken against the
clock), no timing check, no « Sans temps perdu » (`SCORE_VIEWS`; the results page's tabs too). **Placed by points, then time** on
both pages (`arenatabs.scoreRanking`; owner, 2026-11-04: the sources' places follow the time alone, liveresultat's among them):
the points of the controls taken, their number when the controls carry none; late penalties left out (they need the organiser's rules).
By hand: `python -m ffco_scraper.prov --db <db>
--out site/data --days 31 --budget 600` (`--build-only` rebuilds the files without fetching).

## Changing a method: migrations

`update.py` holds version numbers stored in table `engine_meta`. Bumping one makes the next run of any kind
(including the CI deploy run) recompute once, everywhere, then rebuild the whole site:
- `ENGINE_VERSION` — the computation changed: drops data of methods that no longer exist, recomputes `fair` from
  2010 and derives `top6w` (~5 min on CI, ~12 min on the PC).
- `TOP6W_CN_VERSION` — only the recalage/aggregation changed: re-normalises `fair`, re-derives `top6w`.
- `EXTRAS_VERSION` — only a second-stage dataset (`site_extras.py`: co-runners, age pyramid, clubs, age
  curves…) changed: rebuilds them from `site/data` (~35 s), nothing recomputed. Needed when the page code
  reads a new or reshaped file: the push-triggered run only publishes (`--deploy-only`), after `migrate`.
Add a dated line to the comment above the constant. Test the migration locally on a DB copy with
`update.migrate(Path(copy), Path('site/data'))` before pushing.

Keep `cn.py` (Python) and `site/assets/js/cn.js` (browser) in step: same rounding (half away from zero), same
order, same slot logic; the runner page's "Détail du calcul" must reproduce the published values exactly.

## Evaluating a method change

The yardstick used for every decision: on 2025-07 → 2026-10 results, for each pair of finishers on the same
circuit, does the higher CN **15 days before the race** (the runner's own published CN, from `cn_history`; no
fallback) predict who finished ahead? Compare methods on the **same pairs** (both runners have a CN in every
method compared), per terrain. Also check group bias (share of pairs where juniors / 55+ are predicted ahead vs
actually ahead, against H21) and rank drift by number of races. Reference results of the methods before 2026-10-13:
forest Fit 82.3 %, Top 82.1 %, official 80.9 %; sprint Fit 84.0 %, Top 83.9 %, official 80.7 %.
Top linéaire vs Top quadratique (2026-10-07, 2025-07 → 2026-10, same pairs): forest 82.06 → 82.12 % (national races
82.80 → 82.80), sprint 83.94 → 84.01 % (national 82.18 → 82.11); forest scale p90/p10 2.65 → 2.57.
That duel share was the tuning yardstick (each duel counted once). **The published evaluation** (owner, 2026-10-10:
the duel counts were statistically naive; 2026-10-14: weight by runners) is `site_eval.py` -> `evaluation.json`, built by
`site_extras` when missing (a migration deletes it): **the share of duels called right, each circuit weighing its number
of runners** (per circuit p = (right + ½ CN ties) / pairs, then the runner-weighted mean = the mean over results of the
share of a runner's duels called right; Kendall's tau = 2p − 1, also stored, is the same measure on another scale), and
the share of log-time spread explained (R², pooled over results) with the slope fitted on the previous season (out of
sample); the Plackett-Luce information per runner is still computed but no longer shown. Same runners for every method,
circuits of 4+; 95 % intervals by a bootstrap over **competitions** (pairs within a race are not independent); every
season from 2012, the 2012-2024 hold-out (before any tuning) and the tuning period. Results (hold-out, Top − official,
points of duels, the arithmetic Top of 2026-10-14): forest +2.13 [2.02, 2.23] (79.19 → 81.31 %), R² +10.7 pt; sprint
+2.32 [2.03, 2.62] (81.16 → 83.48 %), R² +6.3 pt; national races +1.26 forest, +1.72 sprint; significant in 15 of 15 forest
seasons, 13 of 15 sprint (the geometric Top, then published). The linear Top published since 2026-10-16: see method 3 and
the live `evaluation.json` (pair `top6w-official`). The cubic Top of 2026-10-13
had forest +2.13, sprint +2.41, R² +11.8 / +9.7. The Top of 2026-10-13 (`top6w3`, cubic) − the quadratic one
(study re-run with the weighting, `*_n.json` in the study folder): forest +0.40 [0.35, 0.44] (14 seasons of 15),
national +0.12, R² +2.4 pt; sprint +0.12 [0.09, 0.15]; k = 3 − k = 2 forest +0.04 [0.03, 0.05] (national −0.01, not
significant), k = 4 loses on national races (−0.03 vs k = 2). The Documentation's « L'étude » reads it (forest plots by
season, pooled periods) and `site/assets/study.json`; the k-grid tables (`K_TESTS`, `K_GRID`, the quadratic circuit
value) stay as dated exploratory measurements (duels counted once), labelled as such. Say « significatif » (explained on
the page: the 95 % interval does not contain 0) only when the interval excludes 0. Documentation texts: plain, correct
French, a physical reason for each mathematical choice (owner, 2026-10-14).
Run variants with `run_method` / `derive` on DB copies with `dataclasses.replace(spec.params, ...)`.

## Conventions and gotchas

- **No `confirm()` or `alert()` of the browser** in new code (owner, 2026-11-11: after a few dialogs in a row a browser may stop
  showing them — « don't let this site show more dialogs » — and `confirm()` answers « no » at once: removing a map analysis's
  circuits, then the analysis itself, did nothing). `askbox.js` `confirmBox(message, { ok })` (a promise of true/false, the
  confirming button worded as the action) and `alertBox(message)` draw them in the page; it answers from its buttons, Escape and
  a click beside it, never waiting for the dialog's « close » event (not fired in a page that is not drawn). The analyses' pages
  (`shared.js`, `sharedviews.js`, `mapanalysis.js`) use it; Mes cartes, Santé's authoring, the admin page and a few others still call
  the browser's.
- **A date field's day in words** (owner, 2026-11-11: a browser in English (US) orders `<input type="date">` month/day whatever the
  site's language — 10/11 typed for 10 November saved 11 October, the field showing « 10/11 » again when reopened): `datewords.js`
  `watch()` (started by `app.start`) writes the day in the site's language under any date field as soon as it is typed in or
  picked (`.date-words`, « dimanche 11 octobre 2026 »); `dateWords(input)` shows it from the start (the map analysis's date and the
  new training's). The analysis's « Enregistrer » says « ✓ Enregistré » once the card is drawn again (`.sh-saved`).
- Commit messages: a short title, a body explaining why, ending with the `Co-Authored-By` line the session
  provides. Commit and push only when the owner asks or has agreed to the change; usually: implement locally,
  test, then commit, push and confirm the CI run and the live site.
- Many files use CRLF line endings: edit them preserving line endings (read/write bytes in Python scripts).
  In Git Bash, heredocs with quotes break easily: write patch scripts to a file, then run them.
- The login page (`pages/overview.js`, public) shows on wide screens a reel of 18 slides (« Analyse GPS » and « Jeux »
  added 2026-10-14, drawn on a made-up orienteering map: `reel.terrain`, `course`; « Tracé » added 2026-10-15, a screenshot,
  `site/assets/reel-tracer.webp`, of the Tracer's editor on the games' forest map — `forestMap(20261015, {w: 900, h: 600,
  features: 1.4, relief: 28})` drawn at 3 px a unit, 300 ppp, 1:10 000 — with an invented course, taken by headless Edge over
  the DevTools protocol at 2x on a local training event and cropped to the editor: no name, no site header; « Analyse GPS »
  since 2026-10-16 a screenshot too, `site/assets/reel-trace.webp`: « Analyse solo » in full window playing an invented runner
  on the games' forest map, seed 20261016, 900 x 600 m at 2.4 px/m, an invented course drawn in purple, the routes by the
  games' path finder, a GPX with heart rate and cadence and a KMZ placing the map — scratch `reelgps/` gen_map.js, gen.mjs,
  make_files.py, shot.mjs; nothing real. The « Tracé » slide no longer names Purple Pen (owner, 2026-10-16)) (`reel.js`: drawn views of the
  analyses with **made-up figures and blurred invented names** — the page and the repo are public, never real results
  or names there; texts `reel.*` in `i18n.js`; story-like bars, ‹ ›, pause, ←/→; paused on hover, when hidden, and not
  automatic under reduced motion); a phone shows the name and the tagline above the login card only (its short text, `.home-text`,
  was removed on 2026-10-30, owner: the sections below say it at length).
- **The site in pictures** (owner, 2026-10-19; first made as a brochure for Swiss Orienteering): the home page, under the hero,
  presents the whole site (`site/assets/js/tour.js`, rendered by `pages/overview.js`; texts `tour.*` in both catalogues; styles
  `.tour-*`): a course drawn down the page — the start triangle, nine numbered controls in the menu's order (owner, 2026-10-21:
  races, the GPS analysis — a computer's picture beside a phone's, `dp` —, runner, ranking, the CN Top with its duel figures,
  clubs, training, organisers, phones; a phone among screenshots kept to a phone's size, `.tour-g-3 .tour-phone`), the finish (privacy pledges, « Créer mon compte », the demo-account
  offer) —, screenshots that enlarge on click, two drawn mockups (« En direct », the phone's notifications), the live counts of
  `meta.json`. **Its screenshots show nobody's real results** (the page is public): `site/assets/tour/<fr|en>/*.webp` were taken
  on a **scrambled copy of the data** — the R2 database copied to `C:\kerkia\Ozimut\work\synth`, scrambled by the scratch `synth.py`
  (invented names and licences, each club code given another club's members, every time multiplied by the runner's own factor
  0.90-1.10 and a per-race noise, official CN and points scaled back, places recounted, the organisers' files likewise), then
  `update.migrate` + the provisional build on it (scratch `build_synth.py`, into `synth/out/data`), and the screenshots by
  puppeteer-core + headless Edge (from PowerShell: the Bash sandbox blocks the browser) on the local dev server with every
  `/data/` request served from that copy and the account shown as « Camille Martin » (scratch `shots/lib.mjs`, `OCN_SYNTH`). Never
  replace them with screenshots of the real data. « Analyse GPS » and « Tracé » reuse the reel's invented images;
  `tour/<lang>/phone-analysis.webp` (2026-10-21) is the same invented run (`site/data/_trtest/carte.kmz` + `trace.gpx`) in « Analyse
  solo » on a phone, full window, 280 × 606 at 2×, dark theme, by headless Edge (scripts kept with the session's scratch).
  **Keep `synth/`** (owner, 2026-10-20: the data to redo the docs, slides and pictures stays). The sessions' scratch folders
  were emptied on 2026-10-20; their scripts (`synth.py`, `build_synth.py`, `shots/`, `reelgps/`, `shot_tracer2.mjs`, the
  studies' scripts…) were kept in `C:\kerkia\Ozimut\work\scratch-scripts\<project>\<session>\scratchpad\`. Study database
  copies and variant outputs are deleted once a study is over; the evaluations and logs stay.
- **Coupe de France des clubs** (2026-10-10): `site_extras.cfc` -> `cfc.json`, FFCO's « Classement National des Clubs »
  rule of 2026 (annexe 2: each runner's 5 best official CN race scores of the year in foot + 5 best in VTT or ski, women
  x 1.4) applied to every season (not awarded 2023-2025); unofficial: every ranked runner counts (licence type unknown),
  a runner's club is that of their last race of the year. Shown on « Comparer des clubs » (seasons of the selected
  clubs, one season's ranking). FFCO's own cup pages are gone (404); nothing to scrape.
- **Palmarès** (« Relais » until 2026-11-05, owner; the same page and route, Stats' menu): its relay tabs are « Champions relais », « Classements relais », « Éditions relais », « Club », then the **individual championships** (owner, 2026-11-05): « Champions » (runners or clubs by titles and medals over a period — a championship or all, a group of categories, a sex), « Éditions championnats » (venue, day, runners ranked, élite winners; a year opens its ranking) and « Classements championnats » (one edition, category by category, the runner linked to their page). The data: `champs.py`, run by every update (`update.main`, after `relays.build`), reads the results database — the foot CFMD, CFLD, CFS and CF de nuit (formerly CNN) and the VTT and ski middle, long and sprint championships from 2011 (a championship's key is its discipline and format, `fmd` … `ssp`, the race's `specialite` saying the discipline — the first version, built on the PC's old foot-only database, took the VTT and ski races for the foot ones on the live site: owner, 2026-11-05; the page chooses a discipline, then a format), FFCO's archive holding nothing earlier — into `fr/champs.json` (each edition's place, day, races and podiums, ~210 KB) and `fr/champs/<champ>-<year>.json` (every category's whole ranking: place, licence, name, club, time, status). The races giving the titles are read from their names (`champ_of`: FFCO's groupe B1, no qualification, B final, open, « sans inscription », university or league race; circuits named « OPEN » left out), an élite final giving H21/D21 and a « jeunes et élites » final its own categories before the main race (`rank_of`); a category's place counted within it on its circuit; the anonymised runners as everywhere (`privacy.Anon`). Gaps are FFCO's: no CF de nuit 2013, the 2024 sprint final published for three circuits. **The editions of 2001-2010** (owner, 2026-11-11): FFCO's former site www.ffco.asso.fr (2001-2006 on the Wayback Machine — CF results under `/result/`, `/resultats200x/`, `/site guigui/Autoextract/Resultats/`; the Wayback refuses the PC's VPN), LIFCO's, ECHO 73's and the organisers' copies and WinSplits, parsed into one CSV, R2 `champs/old.csv` (results: never in the repository; the workflow copies `champs/` to `$CN_DATA_DIR/champs/`), read by `champs.old_editions` for the years the database lacks: 60 editions, 17 281 rows (`old: 1` in the index). Before 2008 FFCO's categories were age groups (bands read from the birth years): Benjamin 12, Minime 14, Cadet 16, Junior 18, Espoir 20, Senior 21 (21-39), Vétéran 1-4 → 40, 50, 60, 70 (ten years each); the « Elite » class gives the title, Long, Court and Initiation classes left out. A title goes to a French runner: foreigners and runners without an FFCO licence (`foreign` 1, a Belgian and a Czech of French clubs among them) keep their time with the status « hc » (« Hors champ. »), the others' places = the printed place less the foreigners ahead. MD 2002-2004: the élite final only (the May « Critérium national MD » was no championship); MD 2005-2006: H21/D21 from the August final, the other categories from the May CF MD. Runners are linked to their page when the site's index holds one runner of that name whose sex and age fit (`_linker`). Partial: LD and MD 2008 (ECHO 73's extracts, no H21), sprint 2007, night 2008, ski MD 2008; MTB-O 2007 podiums only; missing: sprint 2002 and 2008, night 2010, MTB-O 2008, LD H21/H40 2001 (cancelled). Nothing before 2001 is online (CO'Mag from 2008 only). The parsers and the merge (`merge.py`, the fixes after them) are kept with the session's scratch, copied to `C:\kerkia\Ozimut\work\scratch-scripts`. **The sprint relay championship** (CFRS, since 2017 — 2020 cancelled —, one mixed relay of four, a woman's leg first and last; owner, 2026-11-05) is the relays' third competition (`relays.py` `CRS_CAT`, key `crs`, `EDITIONS.crs`): 503 teams of nine complete editions gathered on 2026-11-05 from FFCO's archive (archives.ffcorientation.fr, each edition's « Résultats complets »), in R2 `relays/crs.csv` like the others; 2023 and 2024 print no club numbers (tied by name, « ASO » 2023 left without a club); the CNSR of 2015-2016, its forerunner, is not in.
- **Relais nationaux** (`#/relais-nationaux`, `pages/relayhistory.js`, menu « Classement » after « Clubs »; owner, 2026-10-26): the
  history of the Championnat de France des Clubs (CFC, 1999 on: its four divisions — D1-D4, then N1/N2/Promotion
  Nationale/Promotion 2007-2009, N1-N4 since 2010 — and the youth relay, the Trophée Thierry Gueorgiou) and the CNE (2006 on:
  Hommes, Dames, Jeunes, Mini-relais). Not to be confused with `cfc.json`, the Coupe de France des clubs recomputed. The
  rankings were gathered by hand from the archives on 2026-10-26 (LIFCO, archives.ffcorientation.fr, CO Mulhouse's former
  site, the organisers' files, O'Live; ~12 000 team rows): two CSVs (`year;division|category;place;team;club_code;time;status;
  source`), **results, so never in the repository**: in R2 `relays/cfc.csv` and `relays/cne.csv` (`npx wrangler r2 object put
  cn-state/relays/<file> --file <csv> --remote`; a copy in `C:\kerkia\Ozimut\data\relays`), synced by the workflow to
  `$CN_DATA_DIR/relays/`; `relays.py build` (every run, from `update.main`) writes `fr/relays.json` when they changed. A new
  edition = its rows appended to the CSV, uploaded again. Gaps: CFC 1999-2003 the champion only (`KNOWN`), 2002 nothing,
  2004-2005 extracts; CNE 2015 a few places, 2019 ECHO 73's extract (both on Helga only, which refuses robots). Teams are tied
  to clubs (`Clubs.of`): the club number the file prints, else a number in the team's name, else the name's first words
  among those the numbered teams and FFCO's club list use (a prefix must point to one club in 3/4 of its uses; generic words
  alone never), else `ALIAS`/`TEAM_RE`; open (« OPEN », FFCO's 9998), mixed, military, league and foreign teams have no club.
  A club's place in an edition = its best team's among the clubs' teams; points 100, 80, 60, 50, 45, 40… 1 for the 30th (the
  World Cup's old scale). Tabs: Palmarès (period, category or all, points or medals; the leaders' cumulated points), Classements
  (one edition complete, gap, club place and points), Club (places year by year), Éditions (venues, field sizes, winners). The
  page shows the files' order: FFCO's official CFC podiums sometimes skip a club's lower team (said under N2-N4).
- **Annuaire** (`#/clubs?onglet=annuaire`, `pages/clubdir.js`, the last view of Clubs, after « Mon club », France only; owner,
  2026-10-31): every club
  FFCO lists with its website, as a tree — the ligues (their site), their départements (their committee's, the CDCO's), their
  clubs (their own) — beside a map of France's ligues and départements (`geo/departements.json` and `regions.json`, drawn as SVG;
  hidden under 640 px). A node under the mouse in the tree (or chosen) lights up on the map as a chosen one does — a ligue its
  départements, a département or a club its own (owner, 2026-11-01); the map is never zoomed, only coloured (owner, 2026-10-31:
  every ligue stays in reach); a click on the map chooses the ligue, a second one inside it the département, and opens that node
  alone in the tree (`?sel=L:AR|D:69|C:0109`). **A node chosen fills the card above the map** (owner, 2026-11-01: `.cdir-card`,
  `drawCard`; the map and the card sticky on the right): its kind and place, website, size, figures, and the contacts below; a
  club's card has « Page du club » (`link.club`), its name in the tree no longer links. The counts of known websites are one
  line above the tree (`.cdir-sum`). **Under 900 px** the tree is alone and a choice shows the card (and the map above 640 px)
  in its place, « ‹ Retour à la liste » above it leading back to the node (`.cdir.show-info`).
  A website not found is said (« site non trouvé »), as is a département without a committee. The data: `ffco_scraper/prov/clubdir.py`,
  run by every provisional run after the club directory: FFCO's structure pages on api.ffcorientation.fr (`/iframe/structures/`,
  `/iframe/ligues/<id>/`, `/iframe/comites/<id>/`; tables `prov_struct`, `prov_struct_club`), each read again every 7 days (the
  first time all ~110 at once), numbers, names, websites and **contacts** — the « Bureau » (officers' names and roles), phone and
  e-mail each page and each club's popup prints (`clubdir.contact`, column `contact` of `prov_struct` and `prov_club_dir`; NULL =
  not read since, which makes it due), never the postal address; a club a committee lists that `prov_club_dir` lacks is queued
  there, whose popups are now read every 14 days (30 before). **The contacts are FFCO's licensees' only** (owner, 2026-10-31):
  a file of their own, `fr/clubdir_contacts.json` (`{L, D, C}` by ligue, département, club), which the login gate refuses to a
  session without a licence or of a demo account (`_middleware.js`, 403 `licence`); the privacy page says what is kept and why.
  The card shows them. **Figures**, in the browser (`clubStats`): per club, the licensees holding a value in the site's method at
  the last month-end, in any discipline (by discipline in the card and the tooltip), and the runners whose last race is within
  12 months; summed by département and ligue, in the rows and the card.
  A club's site: FFCO's directory's, else the agenda's (`prov_clubs`, tagged « d'après l'agenda », payment and registration hosts
  and the structures' own sites left out). `clubdir.build` writes `fr/clubdir.json` and `fr/clubdir_contacts.json` only once every
  listed page was read and when their content changed (a deploy then). On 2026-10-31: 13 ligues (13 with a site), 95 committees (41), 189 clubs (163; 2 from the
  agenda); of the 183 club numbers in results since September 2025 only 3801 and 7203 are absent from FFCO's lists (and the
  « INDIVIDUEL » xx99 numbers).
- **Relais** (`#/relais`, `pages/relays.js`, a view of Clubs; 2026-10-10): a relay simulator. A format defines its discipline
  (`relay.terrainOf`: CFC, CNE, relais de catégorie in forest; the sprint relay — 2 women, 2 men of any category, D-H-H-D —
  in sprint), whatever the site-wide one; only one's own format has a discipline selector (owner, 2026-10-12). A club that
  cannot field a team is told which criterion fails. « Coureurs ajoutés » (2026-10-12): an account adds to a club the people
  who race relays without a CN (abroad, relays only): name, sex, age group, an expected CN per discipline; they join the club's
  teams (tag « ajouté »). Saved per account and club in D1 `relay_runners` (migration 0008, `api/account/relay.js` GET/PUT),
  seen by that account only, deleted with it (the privacy page says so); without the table the page keeps them for the visit. Formats from FFCO's 2026
  rules (`relay.js` `PRESETS`: CFC N1-N4 with their composition criteria and reserved legs — the women's/men's first and
  last legs alternate with the year's parity —, CNE Hommes/Dames/Jeunes/mini, relais de catégorie) or one's own legs.
  The owner's model: a runner of CN c runs k x ref / c on a leg; k makes the best team of all clubs (CNE: the mean of
  the 5 best) total the sum of the reference times. Best team exact: every distinct matching of criteria to legs, then
  the Hungarian algorithm (checked against brute force); clubs that cannot beat the shown teams are skipped by a bound.
  Age and sex from the category (a veteran racing H21 counts as 21). The first team can be changed runner by runner, two
  legs exchange their runners (▲ ▼, or the row's grip ⋮⋮ dropped on another row; owner, 2026-10-14), and a runner of the
  club can be marked **unavailable** (the « ✕ » at the end of any team row, or the « Indisponibles » block of the added-runners card:
  out of the pool and the teams, saved with the added runners — `relay_runners.runners` holds `{ runners, out }` since
  2026-10-14, a plain list before; `/api/account/relay` reads both). **The format proposed** (owner, 2026-10-14): the link's
  `?f=`, else the one chosen last time (`localStorage ocn.relay`: format, the custom format's legs, discipline, club) unless
  the agenda's next national relay changed since, else that relay's (`relay.nextNationalRelay`: CNE → `cneH`, CFC → `cfc1`,
  Championnat de France de relais → `rcH21`, de relais sprint → `spr`; ligue and regional relays are not national), else
  `cfc1`; the format card names that relay with a link to the agenda and offers its format.
- **Jeux** (`#/jeux`, `pages/games.js`, in the menu group « Entrainement » — « Jeux » until 2026-10-14; group key `training` — in the map's course purple `--course`; 2026-10-13, administrators only until 2026-10-15, every account since (owner)): twelve training games as tabs, after the games catalogued by o-mate.app (Ben Brown's orienteering games and his MIT-licensed Rapid Route, Laby's maze; the video game skipped). **Nothing comes from those sites**: the maps are generated in the browser from a seed (`games/mapgen.js`: a forest map — relief by a height field and marching-squares contours `games/terrain.js`, vegetation, marshes, paths routed by Dijkstra, boulders/knolls/pits/cliffs/trees —, a sprint map — streets, blocks, walls with gaps, parks, olive —, and a maze), the « photos » are drawn by a height-field renderer (`games/scene.js`: one column at a time, trees and bushes scattered by a hash, the map's features and control flags as shapes). `games/path.js`: cost grid (ground cost `COST`, climb) and Dijkstra, straightened in street maps (`stringPull`), `routeCost` of any polyline. `games/quiz.js`: the common engine (puzzles, timer, answer buttons or a puzzle handling its own play, the solution shown, scoring rules `SCORING`, summary, best score in `localStorage ocn.games.best`). **A run's puzzles are made before it starts** (owner, 2026-10-31: some games took seconds, the page frozen, and users of Edge saw nothing happen): `prepare` makes them one at a time, the page drawn between two, from the rules' page on (paused while the game's tab is hidden), with a bar (`.g-prep`, « Préparation des cartes n / N ») on the rules' page when it takes a while and in place of the game when « Commencer » comes first; the timer counts the answer only. Edge's « enhanced security » runs a site it does not know without its JIT: measured in headless Edge with `--js-flags=--jitless`, ten times slower (Variante la plus rapide 5-9 s a puzzle before, 18 s for the five now). `path.dijkstra` is an A* (octile distance at the grid's cheapest ground, the same costs, ~3× faster) on a heap of two flat arrays; Choix d'itinéraire keeps its routes apart by a mask (6× faster); Choix de parcours / Variante reuse their common first leg. One module per game: Tracé rapide (draw the shortest route, sprint or maze), Mémoire de carte (ski-O track network, choose at each junction), Courbes de niveau (which profile), Montée ou descente ?, Cartes identiques, Cherchez l'erreur, Choix de parcours (knockout: 20 s of map, 5 s to choose), Variante la plus rapide (relay forking, decision time + run time), Choix d'itinéraire (fastest of 3-4 routes by `routeCost`), Mémoire photo, Trail'O (flags lettered left to right, Z when none), Labyrinthe (first-person raycaster, the map without one's position). Texts `g.*` in `i18n.js`; styles `.g-*` in `app.css`. **On a phone** (owner, 2026-10-31: « check that all games work », the Labyrinthe unusable): the
pictures to compare two a row, a tap on an option's picture (`.g-pick-<option>`) answers as its button (`quiz.js`; a picked one is marked
in multi-pick games), the answers and the result stay at the screen's bottom (sticky), no double-tap zoom (`touch-action: manipulation`);
the Labyrinthe's view is nearly square on a narrow screen, hedge height tied to the lens (`WALL`), the start facing an open way, the
buttons a pad, the view itself tapped (left/right third turns, middle steps, a swipe down steps back), its map as large as the view.
Every multiple-choice game was played through to its score page at phone size, without errors. Local test: the dev config `pages-dev-games` (port 8790) passes `--binding ADMIN_EMAILS=<the local test account>` so the games show.
- **Virtually** (Coach › Virtually, `#/virtually`, route `virtually`, `pages/virtually.js`; the game `games/virtually.js` +
  `games/vworld.js`; owner, 2026-11-10, after Catching Features and Virtual-O — a tab of « Jeux » that day, a Coach page of its own
  since 2026-11-11, `#/jeux?onglet=virtually` leading there; administrators only until 2026-11-12, then every account for its
  Entraînement and Avatar tabs (« Ozimut Pixel » above): `functions/api/virtual` serves every account the maps, their packages, the
  runs' list and their own training runs; a run's route: one's own, an administrator's, any training run's — the ghosts, the
  analysis —, a competition's once its event is over). **Owner, 2026-11-12, the phone and the start**: the briefing — a card over the game's box from the click on
  « Commencer », while the package loads: the course, its description sheet (`briefSheet`, from the page's race.json and the
  symbols, before the world exists; the race's own sheet once built), the commands (`keysHtml`: the keyboard's, or a touch screen's
  own list), « Partir » greyed beside a status line until the chunks round the start are built (Enter starts too); the same card
  after « Abandonner » / « Recommencer ». The commands at any time: « ? » or H (a panel, the clock running on; not on a touch screen,
  where the pause card lists them — every pause card does). The map's and the descriptions' views say how to go back: « ‹ Retour à
  la course » over the map (bottom), at the foot of the sheet (sticky), Escape, and the pad's « Carte » reads « Retour » while
  either fills the screen. Full screen: the browser's own, else (no API — iPhones —, refused, or no answer within 0.6 s) the game
  fixed over the window (`.vt-fs`, `html.vt-fs-on`); a touch screen enters it at « Partir ». The pad's buttons capture the finger
  (a thumb sliding off no longer stops the runner). The finish card goes under the map on a phone held upright. On a phone the
  chosen map's circuits and « Commencer » come right under that map (`.vtp-inline`). **The training's palmarès** (a button beside
  a map's circuits, a pop-up as the games'): per circuit, the 20 best training times, each runner's best (`runs?race=`):
  a virtual race in a 3D forest made from a real orienteering map. The runner is seen from behind (V: through their eyes; the view the race starts in chosen beside « Commencer », « Vue : derrière le
  coureur | par ses yeux », kept in `localStorage ocn.vt.view`, an event's races included — owner, 2026-11-14), the map
  with the course in a panel (M: small, large, hidden), a compass
  (baseplate, red needle north, the dial turning with the runner: the map's north is the world's, the world being the map's paper
  frame in metres). **The race's screen** (owner, 2026-11-11): the map in the bottom left corner — large at the start since 2026-11-14 (owner: « démarre carte grande, le meilleur mode »; M or ⤢ makes it small) —, the compass beside it, both left of
  the centre where the runner stands at every size (app.css `--mw`/`--mh`/`--cw` by `.vt[data-map]`: large = half the width less the
  compass; on a touch screen smaller, the pad at the bottom right; a phone upright: map ≤ 36 % of the width, the compass above the pad;
  the game's box fits under the site's bar, so a phone on its side sees it whole; « full » is the finish's map beside the card;
  with the large map the runner — or, seen through their eyes, the way ahead — stands in the middle of the width the map, the compass
  and the pad leave free at the runner's height: the camera's picture shifted sideways, `setViewOffset`, eased, `measureFree`; owner,
  2026-11-14); the
  course, time and next control top left; top right « Ma position », **the runner's speed** (owner, 2026-11-14, after « 25' to control 3 on Autrans without a mistake »: a cruise speed, `LEVELS` 0-3 by 0.5, set with ↑ / ↓ — W / S, Z / S on AZERTY, 0-3 on the keyboard, the pad's + / − — and kept with no key pressed, the runner going forward on their own, « − ×2 + » top right; ×L is how many times faster than a real runner the play goes: over the ground L × RUN × the ground's factor × the slope's, the race clock max(L, 1) × the wall clock — from ×1 up a metre costs the same race time, a real runner's, so a higher level only shortens the play; ×0.5 costs double; standing still the clock runs at real time; the finish card gives the race time at each level, `st.paceT`. Shift-walking gone; the side step stays, held — A / E on AZERTY, Q / E on QWERTY —, also while running on (the way slanting
  up to 45°; owner, 2026-11-14: round a tree « quand Z est appuyé »), at a walk's pace when standing. M by its letter (`e.key`: on
  AZERTY M's key is « Semicolon », KeyM is « , »; owner, 2026-11-14: « M ça marche pas »). The stamina of 2026-11-12 kept behind `STAMINA` (false): levels above `TIRED` 2 empty it. Measured 2026-11-14 on Autrans with perfect routes on a 2 m grid (the session's scratch `simrace.py`, `straight.py`): violet long 71 race min (36 of play at ×2), violet middle 38 (19), orange long 42, blue 19; running straight on the bearing costs 30-55 % more there — very steep (18 % mean grade) and 38 % slow, walk or fight vegetation —, which the owner's 25' was. Before: `PLAY` 3, the race clock three times the wall clock, and « ×0.5 … ×2 » paces multiplying the ground speed with a stamina bar), pause, full screen — the start
  screen's speed and position options are gone. **Three views** (owner, 2026-11-12: « toggle very fast between the scene, the map and the descriptions », on a phone as on a computer; `box.dataset.view`, `setView`): the scene, the map filling the game's box (the race's lines, buttons, compass and sheet over it, the scene not drawn meanwhile) and the control descriptions large in the middle — the three icons at the head of the top bar (`.vt-views`, the active one pressed again goes back to the scene), Tab, the pad's « Carte », a tap on the small map. **The control descriptions** are an IOF sheet at the bottom right (`#vt-sheet`, the former text list in the map gone): the course's title, length and climb, the start, a line a control — number, code, columns D-G in Purple Pen's symbols (`tracer/symbols.js`, `cdsymbol.js`, loaded beside the race, the words when they fail) from the control's feature (`FEATURE_CD`: boulder 2.4, knoll 1.10, path junction 5.2 + 10.2, a building's corner 5.11 + G 11.5 and a wall's end 5.8 + G 11.8 with their side read from the town's buildings or walls round the flag, `sideOf`…; tooltips the symbols' names) —, the finish 14.3 with the distance from the last control; the next control's line only, every line once opened (its bar, a click, or C; `localStorage ocn.vt.sheet`), on a touch screen a tap opening the descriptions' view. **The map's orientation** (owner, 2026-11-14: « juste le mode d'orientation manuel », after north up, leg up, way run up and by hand of 2026-11-11/12): **turned by hand only** (`mv.free`, `mapAngle`) — the right button (or Shift + the left) dragged left or right on the map, 0.45° a pixel (`SPIN_PX`; owner, the same day: « avec la souris vers la gauche/droite, bouton droit appuyé »), ↺ ↻ on the map's bar, always shown (a press, a key, a pad button or a wheel notch 3°, held past 0.3 s it goes on at 45° a second, up to 110° a second later — the runner turned 109° a second from the first instant; `TURN_STEP`, `turnRate`, `pressStep`), Shift + wheel, two fingers turned (which also zoom), the , and . keys. **Two one-shot buttons** turn it once and cost `ORIENT_S` (3 s, wall clock, the race clock running) of blank map (`blankUntil`, « Orientation de la carte… »): the way the runner faces up (R, `#vt-orun`) and the current leg up (T, `#vt-oleg`; `orientOnce`) — the owner asked for E and R, but E is the side step: R and T, R no longer an alias of ↑ for the speed (nor F of ↓). **North up only at the start** (N, `#vt-onorth`, free; the button shown only before control 1 within `START_R` 60 m of the start, else a toast says to turn by hand). **At the start the runner faces the start corridor and the map lies along it** (« au départ carte orientée dans le sens du couloir de départ »): the taped corridor's heading (`world.startPos.yaw`), else the way to control 1; N is offered within 60 m of the triangle or the corridor's far end. **◎ frames the leg** (« le bon niveau de zoom, pas que la direction »; `frameLeg`): the current leg with both control circles, zoomed and centred in the part of the panel the buttons leave; pressed again within 4 s, the next leg. `ocn.vt.orient` is no longer read. A turned map draws a north arrow in its corner, its drag and wheel undo the turn (`unturn`), a finished race's map is north up; the map bar is two buttons wide (five rows; on a touch screen 26 px buttons); its buttons are dark with white glyphs (white ones vanished on the map's white paper). **The compass line** (owner, 2026-11-14:
  « la ligne de la boussole… ça permet aux autres manières d'orienter la carte d'être utile »): a black line across the map panel
  through its middle in the direction the runner faces, an arrowhead a third of the way along — never the runner's position: one pans
  the map to lay it where one thinks one is; the map bar's last button or B, on by default, kept in `localStorage ocn.vt.compline`
  (`compassLine`). « Ma position » shows the runner on the map for 10 s of play (`POS_S`, paused with
  the game; the button counts down and cannot be pressed again meanwhile) and adds 30 s to the race time (`POS_PEN`, 20 s until 2026-11-14, owner: « la pénalité doit être plus grande »; the runner
  drawn as a red arrow pointing the way they face — a line ahead read as a tail, the wrong way round —; `st.pen`,
  `st.legPen` per leg, the time shown `total()`): the splits, the finish card (a line and a « Pénalité » column) and the palmarès hold
  the penalised time, the run's `extra` saying « ×2 » (any time at ×2) and « position n× (+s s) »; the rule in the start screen's list
  and the button's tooltip. Checked 2026-11-11 in headless Edge at 1400 × 860 and on phones 375 × 812, 375 × 667, 812 × 375. Physical keys (`e.code`: ZQSD on AZERTY = WASD), arrows, mouse drag to look, Space to punch
  within 6 m of a flag — the flag then glows, a light column and a ring rise, a banner says « Poste 41 — Espace pour poinçonner »;
  controls in order (a wrong or repeated one is said, not punched); speed by the ground class (`race.speed`) and the slope; impassable
  classes, trunks and boulders standing 1.2 m or more block (`World.hits`; owner, 2026-11-12: knee-high ones blocked — a lower rock
  is climbed over, at 60 % of the speed, 35 % from 0.7 m, `World.rough`, `STEP_OVER`). The finish: time, splits, distance run, the route drawn on the map, the run
  kept (below) — the palmarès of 2026-11-10 is gone. Touch screens get a pad. The world streams
  64 m chunks within 250 m (ground mesh 1 m, instanced trees, bushes, ferns/grass as crossed sprites, rocks, walls and cliffs, water
  surfaces); only chunks within 90 m cast shadows (34 fps in headless Edge at 1400 × 860, 2026-11-10). Each race is a package
  (race.json, h.png heights as R·256+G cm, cls.png ground classes, veg.png tree/bush/low densities, ground.jpg, feats.json,
  trees.bin LiDAR trees, map.ocd drawn by the Tracer's `vmap` with its own 7xx course symbols hidden) in R2 `virtual/<race>/`, served
  by `/api/virtual/<race>/<file>`. **Loading** (owner, 2026-11-14: Gif's race, since its 1 320 × 1 040 m, took « an eternity »:
  19-26 s to « Partir » on the PC's dev server, ~35 MB): published with `tools/virtually/pkggz.py` (upload.py, ci.py) — town.bin and
  map.ocd also as `.gz` (14 → 5.5 and 13.9 → 4.8 MB; Cloudflare compresses only text), race.json uploaded last naming them (`gz`)
  and every file's size (`bytes`, the briefing's « Chargement de la course… n % »); `vworld.loadRace` asks for every file at once
  (the town's waited for the rest before), inflates the `.gz` (DecompressionStream; the plain files stay for `virtuallyan.js` and
  older code) and hands the OCAD file over as soon as it is in (`onMap`: the map drawn while the rest downloads); the drawn map is
  kept in IndexedDB `ocn-virtually` (`games/vmapcache.js`, the PNG made by the worker `vmapcacheworker.js`; keyed by the file's
  SHA-256, the layer, the build stamp; 6 maps) — 3-6 s of drawing become 0.3 s from the second race on; only the chunks within
  `NEAR_START` (140 m, virtually.js) are built before « Partir », the rest two a frame during the briefing; the shaders by `renderer.compileAsync`
  (KHR_parallel_shader_compile: the first frame waited 3.5 s for 31 programs one by one) while the textures upload. Measured in
  headless Edge at 1400 × 860 on the dev server: 19-26 s → 12-13.5 s the first time, 4.3 s the next. **Built offline** by `tools/virtually/` (`dump.mjs`, `build.py`, `course.py`, `lidar.py`,
  `upload.py`; inputs outside git in `C:\kerkia\Ozimut\data\virtual\<race>\`: the club's map.ocd — never in the repository —,
  biome.json, the LiDAR): the map's classes by symbol for ISOM 2017 or ISOM 2000 (detected), the relief **read from the map's
  contours** (slope ticks give the downhill side, a closed line without ticks is a hill, the direction carries on from line to line,
  pieces of one contour joined, levels solved, a membrane between the lines, tops and bottoms in the innermost closed lines, the small
  landforms as bumps; the contour interval chosen against the worldwide relief, AWS Terrain Tiles; on Desquinemarre, checked against
  IGN's LiDAR: 77 % of lines at their exact level, 0.78 m RMS within 30 m of a contour), or the national LiDAR's ground and trees where
  there is one (`lidar.py` through mapgen's fetchers; the map's relief is then checked against it). `course.py` sets **six courses a
  map** (owner, 2026-11-11; `race.json` `courses` [{ id, controls, length, climb }], the single `course` of before read as one):
  `blue` (8 controls, ~2.2 km, legs 120-360 m, the sites within 15 m of a handrail — path, track, road, stream —, path junctions
  among them, found by a ring of 8 m meeting the paths three times; each leg's straight line 35 m from a handrail on average, 90 m
  at most), `yellow` (10, ~3 km, 40 m / 80 and 160 m), `orange_md` (12, ~3.4 km, 140-420 m, any distinct feature), `orange_ld` (10,
  ~5 km, 280-800 m, legs across slow or blocked ground rewarded: route choices), `violet_md` (15, ~4 km, 140-450 m, sites away
  from the paths rewarded) and `violet_ld` (13, ~7 km, 300-1150 m, route choices); everywhere no dog-leg, legs 40 m apart, controls
  60 m apart, nothing on impassable or very slow ground, the finish near the start; length the straight legs', climb the rises
  along them (45 s of random search a course; `course_review_<id>.png` beside pkg/). `thumb.mjs` draws each map's thumbnail,
  pkg/thumb.webp (640 px, the map with its logos, by the Tracer's `vmap` in headless Edge: `npm install` in tools/virtually, run
  from PowerShell). Python for build.py and course.py: `C:\kerkia\Ozimut\work\vr3d\venv` (scipy; the global Python has none).
  **The page's four tabs** (2026-11-11): « Entraînement » — the maps as thumbnails (`GET /api/virtual/races`: each map's race.json
  frame and courses, whether it has a thumbnail), a map chosen lists its courses (level colour, km, climb, controls, a line on the
  level), « Commencer » only once both are chosen (no setting there: the speed and « Montrer ma position » are buttons during the
  race, another session's work), the game mounted in place (`mount(root, race, { course, title, onFinish, onNav })`), the finished
  run posted to `/api/virtual/runs` and its card offering « Voir les résultats » / « Analyser ma course »; « Résultats » — a map,
  then a circuit (each course as a training, every event and course the runs name), Stats' race table (`ui.dataTable`: place,
  runner, time, gap, the runner's virtual index today, the virtual score with its gap, `scoreCell`), the runs not ranked below
  (another try); « Classement » — the runners by virtual index (2 counted runs at least), their starting index;
  « Analyse » — one's own runs (`pages/virtuallyan.js`): the map (`drawMap`, `drawOverprint` exported by games/virtually.js) with
  the route run so far and the runner, play / speed / time slider, drag and wheel; the legs' table (time, rank, best, the time lost
  and the mistakes by `trace/legs.js` `refLegs` / `legLoss` over each runner's first run of the circuit, distance run, pace), a leg
  clicked framed and replayed; the pace under the map (`trace/pacestrip.js`); other runners of the circuit ticked beside it.
  **Every account's since 2026-11-14** (owner: « Add Analyse back in pixel, assuming the proposed trainings are all automatically
  opened for both multi and solo analyses, as regular trainings would be »): every training — the maps' courses, the training
  events, the « Cartes du jour » — open to both with nothing to open: « Seul » (one's run alone, solo) and « Avec tous » (every
  other runner of the circuit, each one's first run, multi; or ticked one by one) above the map. **A competition's** other runs
  open once its event's last day is past (`api/virtual` `eventOver`, the page's `canSee`; a competition on a built-in map — the
  administrators' tests — never), said under the chips (`vt.an.compHidden`); the legs' ranks count them all the same (their
  splits, not their routes). **A « Carte du jour »'s run** (`GET runs?race=day`: every day's runs) is analysed on its forest made
  again in the browser (`dayRace`: `vgenpack.makeWorld(dayOpts(day))`, its courses' signature checked against the run's event, its
  package drawn by `drawMap`; a few seconds, said). Visitors without an account: nothing — Pixel is not among `GUEST_ROUTES`, and a
  run is kept only under an account. Tested 2026-11-14 with two local accounts (`work\vr3d\anpost.mjs`, `antest.mjs`).
  **Runs** (`functions/api/virtual/[[path]].js`): R2 `virtual-runs/<race>/<course>/<hash>-<time>.json` — the route `[[t, x, z]]`
  (world metres, 0.1) in the object, the summary in custom metadata (u, n name, t, sp cumulative splits, d metres run, at, h the
  position shown, s seed, k kind, e event) so that one R2 list gives a map's results; `u` = 12 hex digits of SHA-256 over the
  account's number and `SESSION_SECRET` (`_lib/virtual.js` `runnerHash`), never the number; GET `runs?race=`, GET
  `runs/<race>/<run>` (with the route), POST `runs`, DELETE one's own; account deletion removes them. **Events** (owner, 2026-11-11):
  a run is a `training` (played as often as one likes; a map's own six courses are trainings) or a `competition` of an event
  (played once: the server refuses a second run of one event and course, 409); events and their Orga tab below. **The « Indice Ozimut virtuel »** (`games/vindex.js`, explained in the tabs): the Ozimut method on the runs —
  only competitions count (a run's time includes « Ma position »'s penalties), a runner's first run of a circuit; a circuit's value the mean of (index ×
  time) over its fastest 90 % (`cn.circuitValue`, from one runner on); a score = value ÷ time; the index the best 60 % of 12 months'
  scores in 6 places (`cn.topWeighted`), 2 counted runs; before that the seed — the runner's own Ozimut forest index at their first
  run when the site knows it (`data.cnAt` at the latest month, sent with the run), else 3 500 (about the middle of France's forest
  ranking, 2026-10); indices and values computed together in 20 rounds, the scale keeping the mean of the seeds of the runners with
  an index. Trainings are scored (each runner's first run valued) but never counted. **Ghosts** (owner, 2026-11-12: « a user could select a number of ghosts to run with, in training for now »): the Training tab's « Fantômes » beside « Commencer » (0-5, 0 by default, `localStorage ocn.vt.ghosts`; never offered for a competition) replays training runs of the map beside the runner (`pages/virtually.js` `pickGhosts`: training runs without help, each runner once; the course's own — one's own best first, then the fastest, then the runners nearest one's own best time, else the field's median — taken in turn with **the map's other courses'** (owner, 2026-11-14: « runners who did the same map »: each other runner's best run on the course nearest this one in length, nearest one's own pace a km), those named with their course (« Nom · Jaune » above them, `vt.gh.briefOther` in the briefing, under « Sur d'autres circuits de la carte » on the finish card with their time and no gap); their routes read by `GET runs/<race>/<run>`, which serves any training run's route to every account, a competition's still its runner's and the administrators' only). `mount`'s `ghosts` (a list or a promise of { name, t, route, mine }): translucent runners in colours of their own with their names above them, placed on the race clock from their routes, no collision or shadow, drawn within 220 m; on the map only while « Ma position » shows, their routes on the finish's map; the briefing says how many and that rule (`vt.gh.brief`); the finish card's « Contre les fantômes » lists their times and gaps beside one's own. Nothing changes in the results, the ranking or the index. A circled « i » beside « Fantômes » says what a ghost is (`vt.gh.what`: its tooltip, and the text under the line on a tap; owner, 2026-11-14). **The finish card's buttons lead only where the account can go** (owner, 2026-11-14: they blanked the page — « Résultats » and « Analyse » are the administrators' tabs, `show()` of a tab without a panel hid them all): `mount`'s `navs` lists the buttons offered; « Voir les résultats » after a training opens the map's palmarès over the training tab, for administrators too (owner, 2026-11-14: « Résultats is not relevant for trainings, whether for admins or others »), after a competition the Résultats tab (else the palmarès), after an invented terrain its own results on the training tab; « Analyser ma course » the Analyse tab (every account's since 2026-11-14), a « Carte du jour »'s run too, never a « Terrain libre » (not kept); both wait for the run's save, so that the run just finished is the one opened. Local test: launch config `pages-dev-games`
  (8790), `py tools/virtually/upload.py <race>` for the dev server's R2, `work\vr3d\pagetest.mjs` (the four tabs, a race run to its
  finish, two competition runs posted). **Only maps Ozimut may use** (owner, 2026-11-12): races made from open data (the LiDAR
  races below, the towns' sprints) or a club's map with its written permission — never a club's OCAD file found online, whose
  copyright stays the club's. **Granites** (Victoria, Australia: « Donated to and copyright Bendigo Orienteers » in the file) and
  **Foley Mountain** (Orienteering Ottawa's), the first two races, were removed from R2, live and local, that day; their inputs stay
  outside git in `data\virtual\` for tests only. The work of the day (Desquinemarre's movies, `C:\kerkia\Ozimut\work\vr3d`) stays outside git.
  **Invented terrain** (owner, 2026-11-12, after the proposal https://claude.ai/artifact/HnhtgdpVfLAbZoFmS9S3RR; prototype and
  pictures in `C:\Kerkia\Ozimut\work\study\pixel-mapgen\`): `games/vgen.js` makes a world from a seed — five terrain types (`TYPES`:
  moraine — knolls, pits, boulders, marshes, small lakes, eskers —, karst — dolines, rock and stony ground, clearings —, sandrock —
  east-west sandstone crests, boulder fields, gigantic boulders, pines —, valley — V-shaped valleys, spurs, streams, small cliffs —,
  pine — flat plantation parcels, tracks and rides, few features), sliders detail / relief / green / paths (0-1, 0.5 the type's own)
  and a size — and draws from that one model both the package (heights on a 2 m grid, the 1 m ground their bilinear interpolation;
  ground classes in build.py's order; vegetation densities; ground colours by the type's biome; rocks, cliffs, features) and the
  ISOM 2017-2 map's objects at 1:10 000 (contours traced on the same grid by marching squares, each area the region where its smooth
  field is positive, each feature — knoll, pit, boulder, cliff — an object first, paths routed by Dijkstra on 4 m and stamped into
  the classes), so map and 3D agree by construction. **Deterministic**: only arithmetic, `Math.sqrt`, `Math.floor` and integer
  hashing decide the world (trigonometry only for drawing a tick or a symbol's angle), no time budget anywhere; Node and Edge gave the
  day's courses the same signature. `games/vcourse.js` is course.py's rules in JS (six levels, seeded, a fixed number of tries, Bleu
  three times as many); `GEN_LEVELS` lets the Bleu's straight legs run 45 / 110 m from a handrail (35 / 90 m found no Bleu on three
  of the five types: invented path networks are sparser). `games/vgenmap.js` writes the map as OCAD 2018 with Cartographier's
  `writeOcadDoc` (`mapper/symscale.js`, split out of layout.js, so that the game does not load Cartographier's dialogs). **In the
  browser** (`games/vgenworker.js` a module worker, `games/vgenpack.js` the package as loadRace returns it; mount's `load`): Training's
  « Terrain imaginaire » (`pages/virtuallygen.js`, under the maps, tagged « inventé ») — **« Carte du jour »**: one seed a Paris day
  (`parisDay`, `dayOpts`: `seedOf("pixel-day-<YYYYMMDD>")`, the terrain type in turn, 1.2 km, sliders 0.5), the same world and six
  courses for everyone; runs kept as race `day-YYYYMMDD` (functions/api/virtual accepts it without a package, today's or yesterday's
  only, training only, its event the courses' signature `courseSig`, 1-8 hex, so that a browser that made another world never mixes
  its runs with the others'); the day's results under it rank each runner's first run of a course (later runs are training); no
  ghosts and the whole map on those runs; **not counted in the virtual index** (it counts competitions alone, the administrators'
  for now) — and **« Terrain libre »**: type, number (a number always gives the same terrain: shared to run the same forest), size
  0.8-1.6 km, detail, relief, vegetation, paths (`localStorage ocn.vt.gen`); played, never kept (the finish card says so); the
  runner's saved map option applies (its chooser is not shown on that card). The worlds made stay in memory for the visit. **Offline**
  (`tools/virtually/gen.mjs` — the same generator and course setter, 1 200 tries a level —, then `genpack.py` for the package's
  pictures, `thumb.mjs`, `upload.py`): five races among Pixel's maps, source « gen » (`vt.src.gen`), 1.6 km — gen-moraine (seed
  20261112), gen-karst (20261113), gen-sandrock (20261114), gen-valley (20261115), gen-pine (20261116), in live R2 since 2026-11-12;
  no map, LiDAR or licence involved. **Measured** 2026-11-12 in headless Edge on the local server (`C:\Kerkia\Ozimut\work\vr3d\gentest.mjs`):
  a 1.2 km world and its six courses in 3-5 s (Node 2-3 s; a 1.6 km offline race 5-10 s); 30-43 fps at 1400 × 860 and at a phone's
  390 × 844 viewport, Autrans 33 fps the same way; not yet on a real phone. Local test: launch config `pixel-gen` (8772, its own copy
  of the local state, `.wrangler/state-gen`).
  **Sprint in a town** (owner, 2026-11-11: « LiDAR + OpenStreetMap, as realistic as possible »; race **Gif-sur-Yvette**, `gif`, its
  centre 600 × 600 m between the RER station and the church until 2026-11-12, then 1 320 × 1 040 m round 48.6989 N 2.1315 E, Lambert 93
  635420-636740 × 6844142-6845182 — the owner's area drawn on IGN's map (0.48 km², the sports grounds, Le Clos, the station and
  l'Abbaye, georeferenced on two roundabouts of OSM at 0.93 m a pixel) with the old square; the 600 m race kept in
  `DATA/gif_v3_600m`): a race made from open data alone, no club map.
  `tools/virtually/town_fetch.py <race> <lat> <lon> <w> <h>` fetches IGN's LiDAR HD tiles (into `lidar/laz/`, where build.py reads
  them), BD TOPO V3's layers (WFS), BD ORTHO colour and infrared at 0.2 m (WMS), the cadastre's parcels (Etalab) and OpenStreetMap
  (Overpass), 60 m beyond the area, into `DATA/<race>/src/`; `town_all.py <race> [--courses] [--from <step>]` then runs
  `town_map.py` (the **ISSprOM 2019-2 map at 1:4000**: 521 BD TOPO's buildings, 501 roads at their carriageway width plus sidewalks,
  OSM's pedestrian areas, squares, parkings, paved footways and sidewalks, bare unbuilt ground by the infrared within 12 m of a building or 6 m of a
  street (elsewhere open land: a field out of season); 401/402/405 the
  LiDAR's canopy over the infrared's grass; **520 olive for the cadastre's parcels holding a house** (under 6 000 m², no church or
  sports building), schools and the railway's corridor; 411 hedges; 513/515 walls and 516/518 fences passable or not by the
  LiDAR's height along them, 1.5 m; 505/506 paths, 532 stairways, 509 railway, 301/305 water; contours every 2.5 m from the
  LiDAR; 417/418 lone trees from its crowns; 526 monuments, 311 fountains; north lines) → `mkocd.mjs` (the objects into an OCAD
  2018 file with Cartographier's own modules: the ISSprOM set at the map's scale, `writeOcadDoc`; it opens in Cartographier) →
  `dump.mjs` → `build.py` (**now reads ISSprOM**: `SPRINT` by a scale of 1:5000 or larger, or symbol 533; 520/709/714 forbidden,
  411, the impassable walls/fences 515/518/529 and the railway 509 blocking, 522 canopies paved, a `stairs` class at 0.55; mown
  lawns: few low plants) → `town_panoramax.py` → `town_3d.py` → `course_sprint.py`. Python: the venv `C:\Kerkia\Ozimut\work\vr3d\venv` (laspy, shapely,
  rasterio, scikit-image added). **`town_3d.py`** writes `town.json` + `town.bin` (arrays per 64 m chunk, listed in town.json:
  roofs `rpos/rcol/ridx`, walls `wpos/wuv/wseg/wcol/widx`, indices 16-bit when they fit) and replaces `ground.jpg` by the
  photograph at 0.25 m (the shade lightened, the class colours under tree crowns, ×0.8: the photo is lit already): each BD TOPO
  building's **roof fitted to the LiDAR's class-6 points** (RANSAC, up to 8 planes under 51°; each roof node — a 0.9 m lattice and
  the outline — at the **lowest of its candidate planes**, those of its 8 nearest labelled points within 3 m, so a gable's or a
  hip's ridge comes out exact; the points' local median where that is 0.8 m off — a step, a dormer; the creases where two planes
  meet inserted as vertices on every lattice edge they cross; the eaves 0.35 m beyond the walls on a pitched roof, drawn both
  sides; chimneys — 5 points or more standing 0.9-3.5 m above their plane, 1.4 m across at most, 3 a building — as boxes; no
  points: flat at BD TOPO's height), walls from the lowest ground to the roof's edge (Douglas-Peucker on the edge's height: gables), the façade
  counted from the ground's median, its kind from `usage_1` / `nature` (housing, shops, church, sport, industry, annexe) and its
  material from `materiaux_des_murs`' first digit (1 stone, 2 meulière, 4 brick, 6 wood, else plaster), its **colour read on
  Panoramax's street photos** (below; else a plaster of the palette), a shop front where OpenStreetMap places a shop, café, bank…
  within 2.5 m of the outline, the roof's colour the
  photograph's over it blended with its material's (`materiaux_de_la_toiture`: tiles, slates, zinc); walls, fences, hedges and
  stairways (town_map's `walls.json`, heights measured); OSM's street furniture (benches, bins, bollards, bike racks, post boxes,
  lamps, signals, bus stops, cabinets, Morris columns…) and lamps every 26 m along BD TOPO's town roads where OSM has none within
  15 m. **The ground** (owner, 2026-11-11: « address all known flaws »): `surf.png` (0.5 m: 1 asphalt — BD TOPO's carriageways at
  their width and the parkings —, 2 paving stones — OSM's `surface` paving_stones / sett / cobblestone —, 3 concrete, 4 grass, 5
  gravel, 6 forest floor, 7 water, 8 building), and `ground.jpg` the photograph at 0.25 m with its **asphalt cleaned**: the
  road's own colour blurred over ~4 m from its plain pixels only (the cars, people and shade the photograph shows flat on the road
  gone), its markings kept (a white top-hat 0.75 m across, nothing over 1 m wide) and OSM's marked crossings painted as zebras;
  **kerbs** 13 cm along the carriageways (walls of kind `kerb`); **parked cars** where the LiDAR saw them (2023: objects 1.1-2.3 m
  tall on paved ground, 3.2-5.8 × 1.3-2.5 m, by their principal axes; town.json `cars` [x, z, angle, length, width, colour]), which
  stop the runner. **Façade colours from Panoramax** (`town_panoramax.py`; owner, 2026-11-11: « do use Panoramax »): the street
  photos of the area (panoramax.openstreetmap.fr, 360° panoramas and phone photos with their field of view; 457 of 741 in Gif),
  downloaded one at a time into `src/panoramax/` (never in git, never uploaded; the server answered ~30 s a photo on
  2026-11-11: 286 read, the rest at the next run, `PX_NODL=1` fits those already there); each photo's position (± 4 m), heading
  (± 25°) and pitch corrected by matching its skyline to the one the LiDAR's roof points draw from there (a building predicted where
  the photo shows sky costs most, something above a roof — a tree — a quarter; a photo still showing sky over buildings left out);
  every wall it sees 3-35 m away, facing it, nothing between, sampled from 2.3 m above the ground (over the gardens' gates and
  hedges) to under the eaves, sky, deep shade and greenery dropped; a building's colour the median over its walls and photos
  (`src/facades.json`, by BD TOPO's `cleabs`), a brick or meulière hint where the registry gives no material. The photos are read
  in shade under an overcast sky (lightness ~0.35, some blue casts): `town_3d.py` `_fac_colours` takes them as relative colours —
  one gain bringing their median lightness to a plaster's 0.68, lightness kept in 0.42-0.88, blue casts neutral — for buildings
  read on two walls at least (Gif: 67 of 380 read, 45 used; on the enlarged area of 2026-11-12, 753 photos, 171 of 1 062 buildings read, 124 used, the
  photo list `src/panoramax/list.json` asked again — it is kept, so an enlarged area needs it moved aside). **Data only**: Panoramax's photos are CC BY-SA 4.0, the data derived from them allowed under Licence Ouverte
  2.0 / CC BY 4.0 / ODbL; the authors are named in the race's credit (`race.photoAuthors`, `vt.src.town`'s `{authors}`).
  **Photo façades** (owner, 2026-11-11: « I don't mind sharing »; `town_facadetex.py`, run by `town_3d.py`): each building side
  Panoramax's photos see is rectified from them into a tile, the tiles packed into `pkg/facades.webp` (WebP with alpha, one atlas),
  each wall vertex given its atlas place `wtx` and its tile's rectangle `wtr` (town.bin; race.json `town.tex`); vtown.js lays the
  photo over the drawn façade by its alpha. **Never below 2.5 m above the street** (`V0`): Panoramax blurs faces and plates at
  upload (the OSM-FR instance, every photo of Gif CC BY-SA 4.0, checked in its API), but its blurring can miss one — passers-by
  and cars are below that line, the ground floor keeps the drawn façade. A texture needs the camera far more exactly than a colour:
  each photo's pose is refined on the buildings' own edges (`refine`: corners and wall tops from the LiDAR, position ± 3 m, heading,
  camera height, pitch and a panorama's roll; cached in `src/poses_refined.json` with the area it was computed for — another area, as an enlarged race, recomputes it —,
  `TEX_REFINE=1` redoes it), then again for each
  side and photo (`local`: the side rectified must come out straight — `axis_stats` — and anchored at its eaves and corners); a
  tile is kept only when straight (≥ 0.5), anchored (eaves ≥ 0.75, corners ≥ 0.3 of its mean gradient) and 4 m wide or more
  (`anchors`; `TEX_DEBUG=<folder>` writes every candidate and its figures). Set on Gif's 22 candidate tiles of 2026-11-11 so that
  only the two clean ones passed (the rest showed pavement, roofs, a car, foliage: the GPS poses and 2 048 px photos are not
  enough): **2 façades** textured (the « Le Village » archway, a yellow façade on its square), the rest drawn. Better coverage
  would need the photos' poses from their sequences (structure from motion) and the HD pictures. **The atlas is CC BY-SA 4.0**
  (derived from the photos): race.json `textures` says so with `photoCredits` (every photo the façades were read from — the 231 of
  poses.json — by id, author, date, licence and Panoramax link), listed on the race's start screen (`vt.src.photos`); if Virtually
  opens to the public, a package's facades.webp must be offered under CC BY-SA 4.0, as its OSM layers under the ODbL. Measured:
  the same 59-60 fps at 1400 × 860 and at a phone's 390 × 844 (no LOD needed). **`games/vtown.js`** (`loadTown`, `Town`; vworld.js's only hooks: `loadRace` loads it when `race.town`, `World.town`,
  `hits()` asks it, `build()` hands it each chunk; virtually.js keeps the third-person camera out of buildings with `town.clear`):
  roofs and façades drawn by shaders (floors, bays, windows with frames and bars, shutters, doors, shop fronts, a church's stone and
  arched windows, stone courses, meulière, brick; tiles in rows at constant height, slates, zinc seams), walls/hedges as boxes,
  fences a wire mesh, hedges a dark core with the forest's leafy crowns along it (`world.K.bush`), kerbs, stairways treads at
  their ground's height, cars and chimneys and furniture instanced; **its own ground material** (`Town.ground`: the world's map,
  vertex shade and normal map, the grain by the surface code — asphalt, paving stones (setts) and concrete slabs photographed
  (`town-ground.webp`, R G B, CC0 Poly Haven, `tools/virtually/town_textures.py`, credited in the textures' CREDITS.txt; drawn
  procedurally when it fails to load), grass blades, gravel —, the world's position from the vertex); roofs' clay tiles and slates
  photographed too (`town-roof.webp`, along the eaves and up the slope); **street-level ambient occlusion**: the ground baked darker
  where it meets a building (`town_3d.py`, 26 % at the wall, half 0.8 m out), the façades darker at their foot and just under the
  eaves (shader); the runner is
  stopped by the buildings' outlines, impassable walls/fences/hedges, cars and posts (8 m cells; the ground classes `building` /
  `block` then run as paving); the camera by the buildings alone.
  **A mapper's review** (2026-11-12, Alec, setter and mapper; owner: « take it into account as far as possible »): `town_map.py`
  draws the **public road space** paved — what the cadastre leaves between its parcels, within their reach (`PUBLIC`: the
  parcels closed by 20 m less the parcels), so a street's paving runs to the property line, the strip at its side a sidewalk,
  its grass verges open land, its street trees points —; the areas are **one coverage simplified together**
  (`shapely.coverage_simplify`, 0.9 m: the cells' staircases gone, two neighbours keeping one shared edge); **no 402 ring**: a
  wood of 400 m² or more is forest, every tree outside it a 417/418 point; **contours** from the ground smoothed over 4 m, each line
  rounded (Chaikin), dropped or kept whole (no loop under 600 m², no line under 40 m at the map's edge), cut exactly at the
  buildings' outlines — a contour never ends in the open (the mapper: « not allowed »); **the paved area with its edge** (501.1
  « step or edge of paved area » where it meets anything but a building or a wall, fence or hedge already drawn, and the
  carriageways' kerbs in town — OpenOrienteering Mapper's 501 is the area with that edge), the through roads (BD TOPO's importance
  1-3) as paved area with heavy traffic (501.4, Mapper's 501.10); **paths and stairways** from both sources (« what one source has exists, the other is incomplete »: BD TOPO's kept wherever OSM has none of the same kind within 4 m)
  (they were doubled); **stairways at their width** (OSM's `width`, else 2 m; BD TOPO's where OSM has no stairway within 4 m; 532 was one line 1.66 mm wide, 6.6 m on the ground:
  `mkocd.mjs` makes 532.1-532.6 from the set's 532, 0.5-2 mm; the 3D's treads take the width from walls.json's `h`); **every
  tennis court fenced all round** (518, OSM giving each court); a **« boundary to confirm »** (995, purple 50 %, a helper made by
  `mkocd.mjs`): the edge of the ground not to be entered where no wall, fence, hedge or building is known within 1.5 m — on the
  ground it is one of them, the mapper replaces it; and **every OpenStreetMap way and tagged node** on hidden helper symbols (990
  lines, 991 points: status hidden, shown at will in Cartographier or OCAD). The race's map and its thumbnail do not draw symbols
  900 and up (`virtually.js`, `thumb.mjs`). BD TOPO stays for the buildings (footprints with height, use, wall and roof materials
  for the 3D), the carriageways' widths, walls, hedges, water and the sports grounds OSM lacks. Also (same day): **buildings that
  touch drawn as one** (no line between them); **inside the ground not to be entered** its sheds under 20 m², hedges, walls,
  fences, paths and lone trees left out (generalised: the runner never goes in); **contours, streams and paths as Bézier curves**
  (`curve` in map_objects.json, written by mkocd.mjs with Catmull-Rom tangents; build.py flattens them); **a paved footway or
  cycle path is a line**, OpenOrienteering Mapper's 501.6-501.9 « paved area, footprint 1.4 / 2 / 3 / 4 m » (the strip in brown
  30 % between two black edges, made by mkocd.mjs; build.py draws it as paving at its width), not a borderless paved area; **the
  path network joined** before it is drawn (noded, merged through its junctions, an end stopping within 4 m of another path drawn
  on to it); **a grass pitch's edge** as 415 (distinct cultivation boundary). **Bridges and passages** (owner, 2026-11-12: « bridges
  and tunnels need to be shown »): decks from OSM's bridge ways (roads, paths, railways at their width), else BD TOPO's roads and
  railways above ground and its « Pont » lines (« Passerelle » a footbridge); a passage = a way on a lower layer crossing a deck (a
  road under the railway), or a way in a tunnel, covered, under a building or on a negative layer (its part beneath a deck, the
  railway, a building or a carriageway: the Chemin du Bras Mort, `layer=-1` under Rue Alphonse Pécard, dropped until then), else BD
  TOPO's ways below ground and « Tunnel » lines; 512.1 across each mouth (triangles out, toward the lower level), along a deck's
  sides over water, a stream or the railway, 512.2 along a passage of 15 m or more; a hidden 993 area that build.py makes runnable
  over the railway's block line or a building, and `src/passages.json`, cut out of the 3D's buildings by town_3d.py; the water and
  streams cut under decks and in culverts. **Water and wetland** (« you completely ignored the wetland »): OSM's water areas join
  BD TOPO's (not a dry detention basin), its streams where BD TOPO has none, ditches and drains as 306, its `natural=wetland` as 308
  marsh over the ground. **The mapper's third review** (2026-11-12, the owner forwarding Alec): **512.1 only at a passage's mouth**
  (one can go beneath), at least two triangles (1.4 mm), and **a bridge one cannot pass beneath has its sides as 515** (ISSprOM's text
  for 512.1: over water, a stream, the railway), none where a passage comes out; **512.2 along every passage, 512.3** over the part
  of a road or footbridge run on at both levels; a footbridge makes no passage of a way not tagged beneath it, and a way must cross a
  deck side to side; **a passage through a building** (a porch, a covered driveway) is cut out of the building as a canopy 522, no
  512; **the railway track by track** from OSM (the RER's two tracks), BD TOPO's axis only where OSM has none; **every line and
  outline as Bézier curves** (`bez` in map_objects.json, written by `town_map.py`: Catmull-Rom tangents, a corner kept where a line
  turns by over 50° and at every point where the objects through it do not share both neighbours, so touching areas keep one
  edge) but buildings, canopies, walls, fences, stairways, 512 and helpers; the kerbs closed and opened by 1 m (no spike where a road
  meets a roundabout); **stairways at their width, which varies**: cut at the street (carriageway and sidewalk), centred in the passage
  between two buildings and as wide as it (else OSM's or BD TOPO's width, 2 m), drawn in pieces of 532.1-532.6, their footprint
  paved; **paved footways and stairways merged into the paved area** (one area with its 501.1 edge: no crossed edges at junctions;
  501.6-9 no longer drawn); unpaved paths not drawn on paving; **OSM's lawns** (grass, village green, meadow, grassland) as 401;
  **the athletics track runnable** (501, its two edges 501.1, no 709 — the owner's change of the same day; a paved sports ground's
  outline is 501.1); bare ground within 12 m of a sports ground is open land, not paving; **olive only for houses' gardens** (a
  parcel with a building of 3 dwellings or more, or with shops or services, is open: an accessible courtyard had come out olive);
  **no sliver**: any part of an area under 1 m across goes to the neighbour it shares the longest edge with. The checks a mapper's
  software does (OCAD's legibility checker: minimum gaps between impassable features, minimum sizes) are another session's work
  (2026-11-12). **The owner's review of 2026-11-13** (ISSprOM's texts): **contours run through the buildings** (brown 100 % is printed over
  their black 50 %), **square across the streets** (a crossing shorter than three times the street's width laid perpendicular to its
  carriageway's axis), **cut where they cross a stairway**, simplified before they are rounded (no kink), no angle kept on contours
  and watercourses; **ground enclosed** by uncrossable features (buildings less their passages, walls and fences 1.5 m high or
  more, hedges, water, the railway; opened at OSM's gates) and reached from no street, public space or the map's edge is **520**, or
  **part of the building** when buildings make 85 % of its edge (sports grounds left out); **trees** closer than their symbols
  allow (radii + 0.15 mm): two keep the larger, three or more become an area — 402 (open) or 501.3 (paving) from 300 m², else
  forest 405; OSM's stream beside BD TOPO's within 12 m is the same stream; **OCAD corner points** (y flag 1) at every angle of 30°
  or more of a line, so that a pattern (ticks, triangles, dashes) starts again from the corner instead of falling on it; the
  areas cut on a 1 cm grid (GEOS failed on near-coincident outlines). The legibility check (`legibility.py`, run inside
  `town_map.py`) accepts a contour ending only at a stairway or the map's edge, and counts 501.3 as paving. **The owner's review of v6** (2026-11-13): 505's
  junctions open (OCAD's « no left / right line » flags, x and y flag 4, on the segments inside another path's band); 512.3 over every
  passage not through a building, its stripes at about 45° to the passage's axis (the object's angle) and in a white of their own,
  « White over grey (512.3 stripes) », placed above the greys and numbered last (`docs/mapper/sets.mjs` `LATE`: the order differs from
  the numbering, so every other colour keeps its number); 512.2 only when 2.8 m long or more, 0.2 mm from each end (ISSprOM rev. 6);
  no 709 on any sports ground (the course setter's overprint): multi-sport courts paving with their edge; a bridge 0.8 mm wide at
  least, so that its 515 sides keep 0.4 mm between them; OSM's watercourses only where BD TOPO has none within 12 m, piece by piece;
  BD TOPO's paths only where OSM has none within 10 m; the public road space only within 15 m of a street or a square (a stream's
  strip came out paved); OSM's lawns kept inside a paved square; ground reached only through 520 is 520; one tangent at each point,
  from the most natural object through it (water, contours, vegetation, open land without angles); a curve's points 4 m apart at
  least; a street crossed square, the contour coming to it over 3 m; a stairway centred between buildings or 520 with its shift
  smoothed. course_sprint.py tests a control's cell after rounding it as race.json keeps it. **Every remark so far is listed, with
  test places in Gif, in the sessions' notes `standard-remarks.md`**: the legibility session turns them into a rule catalogue from
  ISSprOM's full text and regression tests (2026-11-13). These rules are the generator's (`town_map.py`,
  `mkocd.mjs`), so every town map made after Gif has them — and **Cartographier's « Plan de ville (sprint) » is this same
  generator** (owner, 2026-11-12: one engine, quality before speed; the townmap workflow, see Cartographier), so a rule changed here
  reaches both; the symbols mkocd.mjs used to make (501.6-501.9, 532.1-532.6, 990, 991, 993, 995) are the ISSprOM set's own
  (`docs/mapper/sets.mjs`); mkocd.mjs takes its curves from `frame.js bezier`. `town_map.py --clip` cuts the objects to the area
  asked for (area.json `box`; Pixel keeps the 60 m margin), the edges' rules ignoring that cut; the kerbs are the outline of the town
  carriageways put together, each kind of section merged end to end before it is widened (each section's own outline had drawn a
  line across the street where two sections meet). `town_fetch.py` reads a city's municipal arrondissement first (Paris, Lyon,
  Marseille) and takes IGN's PCI parcels over the area (`parcelles_pci.json`, the same DGFiP parcels) when geo.api.gouv.fr or
  Etalab does not serve a commune.
  **The legibility check** (2026-11-12, after the mapper's remark that OCAD has one: « add tests that the standards are applied »):
  `tools/virtually/legibility.py`, run by `town_map.py` on its objects before it writes them (`--no-fix`: report only; alone:
  `py legibility.py <race> [--fix] [--in F] [--out F]`), so Pixel's town races and Cartographier's « Plan de ville (sprint) » come
  out checked; the report rule by rule with the first places in Lambert 93 in the log and `src/legibility.json`. ISSprOM 2019-2's
  rules: impassable features (521, 520, 411, 301, 709, walls 515/529, fences 518) under 0.4 mm apart (1.6 m; under 0.02 mm they
  touch, OCAD's grid) — closed: a wall's end drawn on to what lies straight ahead (beside it: reported, drawn sideways it made
  zigzags), the space between areas filled with the area's symbol (buildings merged, olive extended), long gaps by a closing, two
  corners by the hull of their near parts; not where a path, stairway or passage runs through (`gap_way`, to widen by hand); the
  wedge where two features meet at an angle is a dead end, not a gap; notches and holes under 0.4 mm filled —; areas under their
  symbol's minimum width or area (minimums.json) and white slivers between areas: a runnable strip given to the neighbour sharing
  most of its edge, an impassable one widened, a building's reported; lines under their minimum length, contours ending in the
  open, 512.1 away from a passage's mouth (reported); lines and trees inside buildings (cut, dropped), trees drawn over each other
  (the smaller dropped), the LiDAR's vegetation over a vector area (cut); a stairway off paving (paving drawn under it); a path or
  paved footway on paving (cut). Two fixing passes then a plain check, before the curves are made: ~3.5 min on top of the
  generator's 5 on Gif's 1.4 km². On Gif (2026-11-12, with the mapper's third review): ~2 190 white slivers and ~400 narrow parts
  mended, 121 small areas given away, 52 gaps and 185 notches closed, 122 trees thinned, 6 stairways paved, 3 paths cut off
  paving; left 15 gaps, 6 a way runs through, 17 short lines, 4 contour ends. **A bridge's sides are no gap** (the sprint
  session, same evening: 95 of Gif's 107 lines in 515 are the decks' sides, two short parallel lines over the water): `town_map.py`
  passes its decks (`decks=DECK_ALL`), the 515 lines along them leave the gap search; without decks (a file, Cartographier) two
  near-parallel 515 lines 1-6 m apart, 40 m long at most, by water, a stream or the railway (legibility.json `bridgeSides`; 79 of
  the 95 found that way). Cartographier's checks on Gif's map.ocd: 35 gaps (107 before that rule).
  Not redrawn after a fix: the paved edge 501.1 and the 995 boundaries keep their place. **The rules are shared**:
  `site/assets/js/mapper/sets/legibility.json` (symbols, the gap, the paving, the stairs…), which Cartographier's checks read too
  (`checks.js` `sprintRules`, on a map of 1:5000 or larger or ISSprOM: gaps under 0.4 mm with the same touching and wedge rules, a
  path on paving, a stairway off it; « Vérifier » and « Lisibilité »; edges bucketed by 1 mm cells: 1 s on Gif's 11 000 objects);
  `tools/mapper/t_legibility.mjs` runs them on a map file.
  **The rule catalogues, the gate, the review sheet, the remarks' tests** (2026-11-13, the owner: « every rule of the standards,
  a gate, a sheet, a test for every remark »): `docs/mapper/standards.py` writes `site/assets/js/mapper/sets/rules-issprom2019-2.json`
  (163 rules) and `rules-isom2017-2.json` (125) — every general rule and symbol of ISSprOM 2019-2 (rev. 6, the Czech text with the
  FR/EN and SE ones) and ISOM 2017-2 with its paragraph, filed as `generator` (town_map.py does it), `check` (a measurable criterion,
  the check's key, `implemented` or `planned`) or `manual` (a mapper's eye), severity `error` for the « shall » rules, `warn`, `info`,
  English and French text, the minimum sizes (minimums.json and rev. 6's) as entries with their `value`; legibility.json names them
  (`catalogues`) with the new parameters (scales, A3, point and line gaps, black lines, openings, olive, north lines, the course
  symbols, white openings). `legibility.py` files every finding under its entry (`Report.entries`), checks the whole catalogue's
  implemented rules — besides the earlier ones: a building's closed courtyards, white openings under 1 mm² (0.5 amid 401/408; cracks
  under 0.05 mm, which print as nothing, mended unreported), points within radii + 0.15 mm, objects inside olive, outlines between
  touching buildings, 518 under 3 mm made 515, the course symbols off the base map, contours cut at stairways, openings in walls and
  fences under 1 mm, the scale, A3, the paved edge's 501.1, black lines side by side under 0.15 mm, the north lines, 512.2 along
  another black line, minimum widths and areas of every area — and gives **the gate**: `gate` {error, warn, info, publishable} in
  src/legibility.json (UTF-8 now), publishable when no « shall » rule is left. `py legibility.py <race> [--fix] [--sheet F.html]
  [--gate]` (--gate: exit 2 when not publishable; the map's edge is its objects' extent, or its area's box when cut to it).
  **`upload.py` refuses a package whose report has errors** unless `--accept-violations`, and the report always goes with the
  package (`virtual/<race>/legibility.json`); `townmap_ci.py` puts it in the town plan (`legibility`: entries with their places)
  and its result (`gate`), and Cartographier says after the import how many points the generator's check left (`map.data.town.leg`).
  **`sheet.py`**: one HTML page, a crop of the map (48 m, 8 px/m, drawn from map_objects.json) round each place flagged — its
  rule's paragraph, text, detail and Lambert 93 coordinates, 12 crops a rule spread over the map —, the summary, the manual list as
  a checklist and the planned checks. **`test_remarks.py <race>`**: a test for each of the 31 remarks of standard-remarks.md and the
  four known places of Gif (Bras Mort, the station tunnel, the town hall lawns, the long stairway), on map_objects.json (its
  curves and OCAD flags: 505's junctions, corner points) and the sources (osm.json, sports.json, bdtopo_batiment.json) and the
  report (`--recheck` runs the check again); 11 (bare ground by sports grounds) and 30 (helpers never printed) are not testable
  from the objects and are skipped with their reason. Exit 1 on a failure.
  **Sports grounds** (owner, 2026-11-11: « a rugby field, soccer fields, tennis courts, a track: can the scene show them? »):
  `town_map.py` reads OpenStreetMap's `leisure=pitch|track` with their `sport` and `surface` (BD TOPO's `terrain_de_sport` where
  OSM has none, its `nature_detaillee` giving the sport; a filled oval's track 8.5 m wide) into `src/sports.json`; the map (owner,
  the same evening: « courts and track lanes not crossable, the posts shown »; Alec, 2026-11-12: « the track is obviously a paved
  area ») draws the tennis and multi-sport courts and the athletics track as paved area 501, the tennis courts fenced all round,
  the track and the multi-sport courts under the setter's 709 out-of-bounds hatching (impassable in the game, the courses go
  round; the track's inner field an island),
  a grass or turf pitch as open land 401, a hard pitch as paved area 501, each goal and pair of rugby posts as a black cross 531
  (prominent man-made feature; 528, a line feature of 8.8 m at least, did not fit: Alec), town_3d.py dropping vworld's « man-made »
  box there; the
  tennis and multi-sport courts' outlines are fenced (518, the 3D's wire mesh up to 4 m) where the LiDAR sees 1.5 m along them in
  2 m pieces (gates and open sides stay open). `town_sports.py` lays each one out in its own frame (the outline's minimum rotated
  rectangle): football (IFAB: penalty and goal areas, arcs, corners; a pitch under 100 m in proportion), rugby union (in-goal
  what the length leaves beyond 100 m, 5-22 m; the 22 m, 10 m, 5 m and 15 m lines; H posts 5.6 m apart, padded), tennis (ITF
  23.77 × 10.97 m, the net across, the court and its run-off each a colour), multi-sport courts (lines, a goal with a basket at
  each end), the athletics track (lanes every 1.22 m from the kerb, the finish line); `town_3d.py` paints each part in the
  photograph's clean median colour (players, shadows and worn lines gone; a ±6 % variation over ~3 m kept), mowing stripes on
  grass, the markings white, surf codes 9 clay and 10 synthetic (vtown.js's grain), the goals, rugby posts and the multi courts'
  goals as props (`goal`, `goal5`, `rugby`, `citygoal`; their posts `pole` / `rpole`, collision only), the goals' and tennis
  nets as walls of kind `net` (impassable), no car read inside a sports ground. On Gif: 2 rugby pitches, 2 football (one on
  artificial turf, mostly outside the area), 11 tennis courts (clay, hard, fine gravel), 2 multi-sport courts, the track, 2
  boules grounds.
  **`course_sprint.py`**: sites on outer building corners (the flag 1.1 m out), monuments, fountains, lone trees and bushes,
  impassable walls' ends, stairways' feet, each on runnable ground joined to the rest of the town (2026-11-12: a wall's end in a pocket
  between a wall and a garden had taken a control no route reached); legs 60-260 m timed on the speeds grid (skimage `MCP_Geometric`, a 130 m window), a leg
  scoring for its route choice (a second route kept 10 m off the best, within 12 % of its time); four courses at the sprint's
  levels (owner, 2026-11-11: « in Sprint there is no violet, and middle makes no sense »), `race.courses` [{ id:
  blue|yellow|orange_s|orange_l, controls, length, climb }] (6, 8, 10, 14 controls, 0.85 to 2.7 km in Gif; the orange ones searched 200
  times), `orange_s` / `orange_l` the Coach page's « Orange court » / « Orange long » (`LEVELS`, `vt.lvl.*`), review pictures `course_review_<id>.png`; then `thumb.mjs <race>` and `upload.py <race> [--remote]`. New feature names `vt.f.corner|monument|fountain|bush|stairs|wallend`, the credit `vt.src.town`
  (IGN LiDAR HD, BD TOPO, BD ORTHO, Licence Ouverte 2.0; OpenStreetMap ODbL; cadastre; Panoramax's authors). Measured 60 fps in
  headless Edge at 1400 × 860 and at a phone's 390 × 844. **Not usable** (study of 2026-11-11, notes `virtually-sprint-report.md` in the sessions' notes folder): Google's
  Photorealistic 3D Tiles (refused with 403 to an EEA project since 2025-07-08, and no storing, deriving or « with any map »
  anywhere), Street View (not « with any map »), Cesium ion's Google and Bing, Apple Look Around; Panoramax's photos are CC BY-SA
  (facts read from them may be used freely; crops as textures carry the share-alike — the photo façades above). If Virtually opens
  to the public, the OSM-derived layers of a package must be offered under the ODbL, its photo façades under CC BY-SA 4.0.
  **Events and the « Orga » tab** (owner, 2026-11-11: « events can be trainings, played many times by a same user and open to all,
  or competitions, only opened to registered users and played only once; rankings are computed from competitions only »):
  `pages/virtuallyorga.js` (`renderOrga`, the page's fifth tab, to accounts with Orga) — « Mes événements », « Nouvel événement »
  (name; type training | competition, a competition's dates `from`/`to`; the map: « Ma carte OCAD », or « LiDAR seul » for
  administrators — a square of 1-3 km round a latitude, longitude; the courses: six proposed by `course.py`, or « Mes propres
  circuits », the map's own OCAD course setting or an IOF XML / OCAD course-setting file sent apart), an event's page (its files sent,
  « Construire la course » with its progress — `waitbar.js`, the stage and share the build writes, every 5 s —, « Publier », « Retirer
  la publication », « Supprimer » through `askbox.confirmBox`, its courses to try — the organisers' own runs are trainings —, its
  settings). The published events are offered in « Entraînement » beside the maps (`races()` adds them as maps, `EVENTS`), their
  package read from `/api/virtual/events/<id>/pkg/` (`mount`'s `base`), a competition's course already run greyed out (« Déjà
  couru ») and none outside its dates. **The server**: `functions/api/virtual/events/[[path]].js` (its header lists the routes; more
  specific than `api/virtual/[[path]]`, so Pages routes `/api/virtual/events/*` to it): R2 `virtual-events/<id>.json` (the event, ids
  `e` + 9 base36; custom metadata `by`, `t`, `s`, `p`), `virtual-events/<id>/map.ocd|courses.ocd|courses.xml` (the organiser's files,
  40 MB / 5 MB, never served), `virtual-ev/<id>/` (the package: as `virtual/<race>/`, `map.webp` instead of `map.ocd` for a LiDAR
  race, `thumb.webp`), `virtual-build/<id>.json` (a build asked for, its progress); the runs as the maps' runs,
  `virtual-runs/<event id>/<course>/<hash>-<time>.json` with `k` and `e` (so « Résultats », « Classement » and `vindex` read them as
  they are). Access on the server: a published, built training to everyone — visitors without an account too (the gate's `GUEST`
  lets the list, an event, its package and its results through; nothing kept of their runs) —, a competition to accounts only,
  between its dates; its run refused a second time (409 « already run ») per account and course; only its organiser (or an
  administrator) changes, builds or deletes it; 20 events an account; « LiDAR seul » administrators only. Account deletion removes an
  organiser's events with their files, package and runs. The privacy page's « Virtually » (11 November 2026). **The build**
  (`.github/workflows/virtually.yml`, dispatched by « Construire » with `GH_DISPATCH_TOKEN`, rounds until no request waits;
  `tools/virtually/ci.py`): the request's stage and share written back as it goes (files, lidar, map, build, courses, upload); an OCAD
  map through `dump.mjs`, then **in France IGN's LiDAR HD under it** (mapgen's catalogue, the tiles the map touches, 12 at most,
  kept for the run's other builds) and `build.py`; the courses by `coursefile.mjs` (the Tracer's `iofin.js` `fromOcad` / `readIof`;
  score courses and variations' other branches left out) and `filecourses.py` (world frame, nearest feature within 10 m for the
  description line), else `course.py <id> 7 40`; the package to `virtual-ev/<id>/`, the event marked ready (its courses in full in
  its record) or failed (the step and its last line). `BUCKET=file://<folder>` runs it all on the PC against a folder standing for R2.
  Measured 2026-11-11 on the PC: Desquinemarre (the club's OCAD, 12 IGN tiles, its own 4 courses) — LiDAR ground on 100 % of the
  cells, 30 949 trees, the map's relief against IGN's: 73 % of contour lines at their exact level, RMS 1.77 m (coarse relief 3.27 m);
  build.py 12 min, most of it reading the point clouds.
  **Races from the LiDAR alone** (owner, 2026-11-11: « not as close to reality as possible, but as close to a good map as possible »;
  administrators; the study, its pictures and the before/after screenshots in `C:\kerkia\Ozimut\work\study\virtually-lidar`; Desquinemarre, the same 2 × 2 km
  from the club's map and from the LiDAR alone, side by side — the geography agrees, the club map alone has the undergrowth,
  rides, out-of-bounds and small point features): `tools/virtually/lidarrace.py <race> <lat> <lon>
  [size]` — mapgen's tiles (karttapullautin + OpenStreetMap, forest style) for the square, then build.py's inputs made from the same
  sources, so that the forest one runs through is the map one reads: `cls_base.png` from karttapullautin's vegetation raster
  (`.vege.png`: white forest, its greens slow / walk / fight, its yellow rough open), OpenStreetMap's ways and areas as ISOM 2017
  objects (roads, tracks, paths, streams, walls, fences, buildings, water, paved and open ground), karttapullautin's cliff strokes
  gathered by contact into boulders (a small group one, an outcrop one every 3 m: Fontainebleau's sandstone), its dot knolls and
  depressions; `map.json` carries `frame` (mm), `epsg`, `lidarOnly`; build.py then takes the LiDAR's ground and trees and no map
  relief; the player's map is the generated map's image (`map.webp`, 0.5 m a pixel; race.json `map` "webp", `mapPx`; `loadRace` →
  `mapImage`, `drawMap`). Measured on Trois Pignons (Fontainebleau, 2 × 2 km, 2026-11-11, PC): mapgen 515 s (karttapullautin 278 s;
  the 1 GB of point clouds 25 min from IGN at the PC's pace), lidarrace 40 s, build.py 234 s, course.py 200 s; 44 747 trees, 9 727
  boulders, a package of 11 MB; 52-56 fps at 1400 × 860. **Autrans (Vercors)** (`autrans`, 2026-11-12, owner: « a very hilly
  region, Vosges, Jura or the Alps »): 45.19324, 5.54477, 1 760 m square, ~1 100-1 500 m, chosen among the boxes around Autrans by
  relief, forest share and no cliff band (the Vercors rim just west of it left out), six LiDAR HD tiles of 2021; its tiles made
  apart (`python -m mapgen tiles … --out DATA/autrans/tiles`), then `lidarrace.py … --tiles DATA/autrans/tiles` with mapgen's
  `work/` (point clouds, `osm_*.json`) moved beside that folder — lidarrace reads it there, and without it finds no OpenStreetMap.
  **Read as a mapper draws** (owner, 2026-11-14, after looking at a club's map of the next valley — only as a reference: it says
  « Copie ou adaptation interdite », so never traced, copied, committed or published, and the race stays open data; the comparison,
  with our own pictures only, in the session's scratch and the shared notes): four generic rules in `lidarrace.py`. **R1** the
  vegetation in ISOM's three greens, generalised: karttapullautin's two lightest of its seven greens are white forest (a fir and
  beech forest's low branches and seedlings), the next two 406, the next two 408, the darkest 410; each cell takes the class most
  present within 6 m (`GEN_R`), patches under `GEN_MIN` (open and rough 300 m², 406 400, 408 300, 410 200) and white holes under
  200 m² go to their surroundings; `map.webp` is karttapullautin's image with its ground repainted from that layer in ISOM's colours
  (its lines kept), and `cls_base.png` is the same layer (Autrans: 53 % of green in 7 700 patches → 32 % in 646; the club's map about
  15-35 %). **R2** open land 401 where karttapullautin's yellow lies on grass: OpenStreetMap's open land and pitches (no longer area
  objects of their own, which covered their trees too) and, in France, IGN's RPG grassland parcels (code_group 18, 19; WFS
  `RPG.LATEST:parcelles_graphiques`, Licence Ouverte 2.0, kept beside the point clouds as `rpg_*.json`, credited in race.json); the
  rest stays 403 (Autrans: 48 parcels, 34 ha). **R3** the rock from karttapullautin's cliffs (c2g) only, chained end to end into
  cliff lines 202 (rock steps in the world; one of 8 m or more is also a control site, build.py's « rockface », 2.5 m from its
  middle on its lower side — its foot —, left out of the editable OCAD; course.py takes a rock face 8 m from slow ground, which
  any other site keeps away from); its c3g steep marks and the boulders and outcrops every 3 m only on sandstone
  (`biomes.sandstone`: Fontainebleau) — on Autrans they made 49 of 139 outcrops and 70 of 236 boulders on steep earth the map did not
  show. **R4** the knolls (109, 10-600 m²) and small depressions (111, 10-300 m²) of 1 m or more in the terrain model (IGN's MNT at
  0.5 m that mapgen fetched, else the tiles' 2 m one), roundish, away from roads, paths, buildings, water and cliffs, 12 m from
  karttapullautin's own, drawn on the map in its brown and placed in the world (control sites; Autrans' slopes: 5 knolls and 1
  hollow more — most bumps there are under 1 m or hills). The CI's build installs scikit-image for it. Autrans was rebuilt with
  them the same day (its courses set again: R3 took away the boulders several controls stood on); its files of before in
  `DATA/autrans/_before_20261114/`. A LiDAR-only event of Orga takes them at its next « Reconstruire ».
  **The map and the world agree point by point** (owner, 2026-11-11): every boulder the race places is drawn on `map.webp` as its
  ISOM dot (204 ⌀ 0.6 mm, 205 ⌀ 0.9 mm at the map's scale), the outcrops as 206 areas. **North lines** (owner, 2026-11-11: missing on the generated map, which matters once the map turns to the leg): blue 601 lines every 300 m (30 mm at 1:10 000) on the grid's round hundreds, on `map.webp` and in `lidar.ocd`, parallel to the frame (the game's north is the grid's). **The map as an editable OCAD file**:
  `lidarrace.editable_ocd` writes `map_objects.json` — the OpenStreetMap objects, the boulders, karttapullautin's contours (101/102/103
  from its vectors) and vegetation areas (403/406/408/410 traced from `cls_base.png`, a median of 3, simplified 0.08 mm) — and
  `mkocd.mjs` makes it an OCAD 2018 file through Cartographier's `ocadout.js` (Trois Pignons: 5 888 objects, 2.3 MB); the CI keeps it
  as `virtual-events/<id>/lidar.ocd`, the event's organisers download it in Orga (`GET …/file/lidar.ocd`, `vo.lidarOcd.*`), correct it in
  OCAD or Cartographier and send it back as the event's `map.ocd`: « Reconstruire » then builds the race from their map with the
  LiDAR under it (`edited` in the event).
  **The forest's look** (owner, 2026-11-11: « a lot more realistic »; `games/vforest.js`, everything procedural — canvases and
  geometry made in the browser, no image or model from elsewhere): crowns of leaf cards (two broadleaf variants, a conifer of
  drooping needle whorls), each card's normals bent out of the crown so that it is lit as one mass, both faces with the same normals
  (`twoSided`: a material's DoubleSide darkened half the cards); bark; grass tufts in open ground, ferns in the forest, swaying in
  the wind (`sway`: a vertex shader by the instance's position); fallen logs; stones with lichen; the ground's litter at two scales
  and its normal map; the canopy's shade in the ground's vertex colours (round each tree, deeper by the trunk); a sky dome (the haze's
  colour at the horizon, blue above, the sun's disc and glow) and exponential fog; the lights tuned (`atmosphere`). **Trees far away
  are impostors**: each kind rendered once to a texture (`impostor`) and drawn as two crossed cards beyond 95 m (`DETAIL`), the low
  vegetation only within 85 m, shadows from the chunks within 80 m. Measured in headless Edge on Granites, the same PC and moment:
  1400 × 860 23 → 34 fps, a phone's 390 × 844 41 → 49 fps.
  **Second round** (owner, 2026-11-11: « start all next steps »): **photographed textures**, CC0 from Poly Haven (forest_leaves_02,
  forest_ground_04, bark_brown_02, lichen_rock) and ambientCG (LeafSet009/010), made once by `tools/virtually/textures.py` into
  `site/assets/textures/virtually/` (0.63 MB, `CREDITS.txt`; downloads not kept in git), each normalised around mid-grey so that the
  biome's and the map's colours still tint them, read as linear data × 2 (`vforest.loadPhotos`, `photoTextures`, `PHOTO_GAIN`;
  `loadRace` fetches them beside the package, the drawn textures stand in for one that fails): the ground's litter or gravel by class
  (`World.groundKinds`, the shader's `gm`: paths, tracks and stony ground gravel, roads and paving a faint grain, the forest by its
  conifers' share, a town's ground a third of it) with a broad variation over tens of metres, bark with its normal map on trunks and
  logs, lichen rock on stones, crown cards of real leaves (1 500 leaves a 512 px cluster, a ragged edge of sprigs, the colour carried
  into the transparent pixels against dark mipmap fringes). **Baked occlusion** in vertex colours (`bakeAO`, `merge` keeps a colour
  attribute): the ground's hollows (3 m around), the foot of trunks and rocks, the inside and underside of crowns and conifers, round
  logs and rocks; shadows softer (radius 4.5). **More varied trees**: four crown shapes (round, lobed, tall and narrow, wide and flat;
  `cardCrown`'s `wide`, `lobes`), spruce cones and, for a third of the tall conifers, pines with a bare trunk and a high rounded crown
  (`cardConifer`'s `shape: "pine"`, its own impostor `farPine2`), saplings under the old trees, every tree's colour a little apart
  (`tint`). **The runner** (`runnerFigure`, same signature): articulated — hips, thighs, shins, feet, torso, arms with elbows, head —,
  walk and run cycles blended by the speed (strides ~0.9 a second walking, ~1.45 at 3.5 m/s), knees lifting and elbows bent when
  running, the body bobbing twice a stride, leaning forward with the speed and into the turns (from the heading's rate). SSAO was not
  taken (a phone's budget). Granites, headless Edge, same PC and moment: 1400 × 860 34.3 → 34.7 fps, 390 × 844 54.7 → 57.0 (Foley
  Mountain 40 at 1400 × 860).
  **Texture sets by terrain type** (owner, 2026-11-13, on Trois Pignons: « photos, like for Sprint… a general solution for more
  realistic scenes in forest? »): a race's biome names a set (`biome.textures`, `vforest.js` `TEXTURE_SETS`), whose roles replace
  the default photo files — the floor, the paths' gravel, the rock — and add their own: « pine-bark » (the conifers on a trunk of
  their own, `K.trunkP`), « needles » (the conifers' cards), « leaves-tree » (half the broadleaf crowns), « grass », « low »;
  `loadPhotos(set)` after race.json (`vgenpack.js` too). The first set, **« sandpine »**, Fontainebleau's: sand under pine needles,
  white sand, grey sandstone, Scots pine bark, sprays of photographed needle pairs, oak leaves — CC0 only (Poly Haven, ambientCG),
  made by `tools/virtually/texsets.py` from the downloads (credits in CREDITS.txt, its block rewritten by the script); 835 KB
  against the default's 611. Photographed grass and a drawn heather were tried and left out (dark blades; a dense card's far
  mipmaps become solid rectangles). The biome by place: `tools/virtually/biomes.py` (`for_place`: Fontainebleau's box, else the
  temperate default), written by lidarrace.py when the race has no biome.json; its colours read on 29 freely licensed Wikimedia
  Commons photos of the Trois Pignons (medians of the floor, the white sand, the sandstone, the pines' bark; only colours, nothing
  kept), more Scots pines (`pineShare` 0.95 over `pineMinH` 7 m) with their reddish trunks (`trunkPine`); vgen's « sandrock »
  takes the same set. Only CC0 libraries, or Commons / Panoramax photos under their licences with credits — never ordinary web
  photos. The live Trois Pignons event (`ecavha6hyc`) was updated in place (race.json's biome and ground.jpg made again from its
  own cls.png and h.png by build.py's formula: its courses and runs kept; a CI rebuild would set new courses, course.py searching
  by time). Measured in headless Edge: 60 fps at 1400 × 860 and 390 × 844, as before. **The trees' shapes** (owner, the same day:
  young pines as dark spikes, pines spruce-shaped, harsh shadows under the bushes): a Scots pine (`pine2`) is an irregular
  umbrella of needle tufts high on its bare trunk (`vforest.cardUmbrella`: tufts of a card lying nearly flat and two upright ones,
  crown 0.66-1 of the height), a young conifer under `youngH` (7 m) a soft ovoid down to the ground, lighter green
  (`cardConifer` shape « young », kind `young`); spruces and firs keep their cones (`pine`). The bushes cast no sun shadow any
  more (their cards' hard-edged shadows were black blots): a soft shade splatted on the ground under each. Trois Pignons still
  59.8 fps at a phone's 390 × 844. Left: no photographed undergrowth (heather, bracken).
  **The ground picture was mirrored north–south until 2026-11-11** (the sprint session found it, the owner met it on Trois Pignons:
  standing on a map's path junction, the path drawn on the ground lay further on): `ground.jpg` is an ImageBitmap, which three.js never
  flips, so its first row (north) is at v = 0 — `build()`'s ground uv is `z / H`. **« Avatar »** (Coach › Virtually's tab between
  Analyse and Orga; owner, 2026-11-11; `games/vavatar.js`): the runner seen in the race — woman or man (narrower shoulders, wider hips,
  a little smaller), eight skin tones (the darkest added the same evening, owner), eight hair colours, short hair, a ponytail (swinging
  with the stride) or a bun, and **two costumes** (owner, the same evening: « orienteering socks go up to the knee, while shorts go
  down to the knee… in sprint shorts are shorter and socks shorter »): « Forêt » — shorts down to the knee and socks up to it, no
  skin showing, or long trousers — and « Sprint » — short shorts and low socks —, each with its own colours of shirt, shorts, socks
  and shoes (14 swatches and any colour; `loadAvatars` keeps { …, forest: { legs, … }, sprint: { … } }, an avatar kept before
  giving its colours to both); the race's discipline chooses (`mount`: ISSprOM or 1:5000 and larger → `loadAvatar("sprint")`;
  `runnerFigure` legs "knee" | "long" | "sprint"); « Au hasard », « Par défaut »; kept in this browser (`localStorage
  ocn.vt.avatar`), shown turning in a small scene standing, walking or running, the costume being edited. The built-in maps also serve `map.webp`
  (a LiDAR race kept as a map: `api/virtual` `FILE`).
  **Weather and night-O** (owner, 2026-11-12: « weather, decided by the creator », « night-O too: at night orienteers use a headlamp,
  which reduces visibility on the sides and far »; `games/vweather.js`): an event's `env` { weather clear | overcast | rain | fog |
  snow, time day | dusk | night, lamp normal | strong } (`functions/api/virtual/events` `cleanEnv`, kept in the event, sent by every
  view of it; set in Orga's new-event form and the event's settings, « Conditions de course », changed at any time without a rebuild;
  shown on the event's card in « Entraînement » and its Orga row, `envText`, and in the race's briefing with the night's rule, keys
  `vt.env.*`, `vo.f.env*`); the built-in maps are a clear day (`mount`'s `opts.env` absent). `applyEnv(T, env, { scene, renderer,
  world, sun, camera })`, called once the course is added, returns an `update` the frame loop calls after placing the sun: the haze's
  and the zenith's colours and density over the biome's, the sun's and sky's light, the sun's disc hidden under a grey sky, **no sun
  shadows unless clear** (cheaper), the far impostors dimmed (they were rendered in sunlight); rain or snow as `Points` in a box round
  the camera, fixed in the world and falling by their shader alone (9 000 / 6 000, a phone 3 000 / 2 200); the ground's shader a
  second pass — darker when wet, white where it faces up when snowy (less on the paths, patchy), grass and ferns hidden under snow;
  dusk a low warm sun; **night** a black haze (density 0.026, a strong lamp 0.018), a faint moon, no shadows, and a `SpotLight` on
  the runner's head (320 cd, ±27°, a strong lamp 650 cd, ±32°; soft at the sides, falling with the square of the distance) aimed
  where the runner looks a little down; the flags' **retroreflective tape**: an additive copy of each flag's prism and a halo sprite
  of some forty pixels however far (0.8 m + 3 % of the distance), lit when the flag is in the beam (its cone, 1 / (1 + (d / reach)²), reach 60 m or 95 m, to 180 m)
  and no rise of the ground in the way (8 samples along the line), every third frame; the code plates no longer glow by themselves. The
  map panel is 2D: readable at night. Measured 2026-11-12 in headless Edge on Granites (`work\vr3d\envtest.mjs`, `nighttest.mjs`):
  1400 × 860 clear 36 fps, overcast 41, rain 41, fog 43, snow 49, dusk 33, night 49, strong lamp 46, rainy night 45; a phone's
  390 × 844 56-60 fps for every condition (60 the headless cap).
  **Map options** (owner, 2026-11-12, after the map-generation ideas: the map as a training exercise; `games/vmapopt.js`): what the
  race's map shows — the whole map, « Sans chemins », « Sans végétation », « Relief seul », « Courbes de niveau seules » (the
  Tracer's training-map choices, moved to `tracer/vmap/presets.js` `presetSymbols` / `PRESETS` and shared with `mapview.js`;
  `drawMap(data, layer)` adds their symbols to those it leaves out) — and « Carte aux postes seulement » (`memory`: the map panel a
  blank sheet but within `MEM_R` 25 m of the last control punched, the start included, for `MEM_S` 45 race s after a punch, while
  « Ma position » shows, before the start and after the finish; never during a pause — a memory exercise). A map's training: the
  runner's choice under « Commencer » (`moChooser`, kept in `localStorage ocn.vt.mapopt`); an event: its creator's in Orga
  (« Carte pendant la course », the event's `mapOpt` { layer, memory }, `cleanMapOpt` in the events API, changed at any time
  without a rebuild), the same for every runner, said under « Commencer » and on the event's card. A race from the LiDAR alone
  draws its map as an image (`imageMap`: `race.map` "webp" or source « lidaronly »): only « Carte aux postes seulement » applies
  there, which the chooser, the Orga form and the briefing say (`usable`). The briefing gives the choice and the rule (`moLine`);
  the finish card says « Couru avec : … » and shows the whole map again; the run keeps them (`mo`, « contours+mem », in its R2
  custom metadata; an event's run takes the event's own, whatever the page sent), shown as a tag beside the runner in a training's
  results and in the analysis. Nothing else changes: the index counts competitions, whose runners all ran with the same options.
- **Apprendre / Learning** (`#/apprendre`, route `learn`, `pages/learn.js`; owner, 2026-11-10): « Définitions de postes » and
  « Symboles de carte » became one Coach page of three views (`?vue=definitions|symboles|test`; `#/definitions` and `#/symboles`
  open theirs; the two modules drawn in place with `embedded`, their own Forêt / Sprint tabs kept in `?onglet=`), the owner's only
  for a day, **everyone's since 2026-11-10** (owner; visitors without an account too, `GUEST_ROUTES`: the test plays, without a
  palmarès). **It opens fast** (owner, 2026-11-10: blank under its tabs for seconds — eight files one after the other): `learn.warm` asks every module and file a view needs at once (the Tracer's catalogue, `symbols.json` preloaded), the spinner under the tabs until the view is drawn, the other views fetched once it is, « Définitions de postes » drawing its Forêt or Sprint tab only when opened, the page in `NO_CHARTS`; `i18n.loadArea` fetches an area's three catalogues together (every area). **Entrainement** (« Test » until 2026-11-10 evening, owner; Training, Training, Entrenamiento; its address still `?vue=test`) (`games/learntest.js`, on the games' engine): a feature shown — by any of a photo of the
  terrain (the default, owner: « the whole point »), its name, its description symbols (`cdsymbol.js`) — and four map extracts
  with a control circle, **the quiz's own** (owner, 2026-11-10: « use those, never invent map extracts »; the circles Ozimut had
  drawn with `isom.isomInCircle` and its path scenes are gone): each question's right answer as the quiz serves it, 147 × 143 px,
  `site/assets/learn/map/<key>.png` (exact palette PNGs of its GIFs), a wrong option showing another feature's; credited in the
  list under the game (`lt.credit.maps`): which is on it?
  **The photos** are not the quiz's (two carry Dreamstime / iStock watermarks, one a photographer's signature, the rest no source):
  20 photos — 19 freely licensed from Wikimedia Commons (CC0 / CC BY / CC BY-SA), and the quiz's own « zone rocheuse » by
  Emmanuel Roiné, used with his permission (owner, 2026-11-10; `permission` in the entry, credited « avec son autorisation »), and five more of his the same evening (route goudronnée, souche, levée de terre — the earth wall's only photo —, grand rocher, petite falaise; their EXIF left out), which **replace the web's photo wherever he has one** (owner: a professional orienteering coach, his photos are best): and nine more on 2026-11-11 (abrupt de terre, borne, butte, coude, croisement and jonction de chemins, falaise, grillage infranchissable, petite ruine; the crossing's camera tag turned it sideways, set upright by hand): and, from the quiz itself (owner, 2026-11-11: « it is in the pdf »), its photos of the boulder cluster and the small hill, credited to the quiz (`quiz` in the entry, `lt.credit.quiz`; its other photos stay out: stock agencies' watermarks): 25 photos, 15 of them his; a feature may have several (`k` naming it), a question drawing one at random —, `site/assets/learn/<key>.webp` (760 × 600 at most), their
  author, licence and page in `games/learnphotos.js`, credited under the photo (the file's page, whose name gives the answer away,
  linked after the answer) and listed under the test. **A photo must be unambiguous** (owner, 2026-11-10: the « petite colline »
  was a big wooded hill behind a vegetation boundary): the feature at a control's scale, nothing else of the list in the frame;
  none for re-entrant, spur and thicket (their name shows instead; the earth wall, path crossing and earth bank have Emmanuel Roiné's, the boulder cluster and small hill the quiz's). Replace one with a photo Ozimut may use: the file and its credit. The settings hide while a run is under way
  (`runGame`'s `onState`), « Arrêter le test » brings them back. **Compact, a question whole on a laptop's screen** (owner,
  2026-11-10): a lean page (no title, its line the menu entry's tooltip), the lede hidden too during a run, « Arrêter le test » on
  the puzzle's line (`topAction`), the game scrolled to the top (`scrollOnPlay`), no question text, no letters (the circles alone
  answer, `pickOnly`), the names in the result's line (« Votre réponse : … ») and the circles' tooltips, the credits only in the
  list under the game (« Apprendre » and « Jeux »), extracts of ~100 px (112 at most), the photo's height from the window's (`100vh − 425px`), the time's bar a thin line under « Énigme n / N »
  (`.g-n-box`), the result centred under the circles; on a phone the four extracts still on one line (~62 px on a 375 px screen) and the result one
  short paragraph — checked at 1366 × 650, 375 × 812 and 375 × 667. The 28 features and each one's three wrong answers (« Facile ») come from a club's
  Wayground quiz the owner gave (« définitions carte course d'orientation »; its photos not used, its map extracts used since the same evening, its wrong options
  mapped to the other questions' features by image matching; its three pictures that answer no question — nine options — kept as they are, `learn/map/<key>-2.png`, `EXTRA`, named by Ozimut's reading: « Rocher » (one boulder in a group, under « Gros rocher »), « Butte » (a small ring of form line, no tick), « Souche » (a green cross; owner, 2026-11-10)); « Aléatoire » draws three of the 28,
  never one with the same symbols. **The training always gives the quiz's groups of four** (owner, 2026-11-10, evening: grouped
  as in its PDF; `testSpec`'s `mode` "groups"; the random mixing of before gone) and keeps no palmarès. The name sits right over the photo, centred with it (`.lt-name` in `.lt-photo`; owner, 2026-11-10: not at the question's far left). The question shows the photo and the name by default, not the description symbols (owner, 2026-11-10; `DEFAULTS.show`, settings kept in `ocn.learn.test.v3`). The user sets the number of questions (20 by default) and the time each (10 s by default, 5 to
  60; `runGame`'s `limit`: a countdown, wrong at zero), `localStorage ocn.learn.test.v3`; « Commencer » and its rules above the settings. Also « Quel poste ? » in Jeux: no settings
  (20 questions of 10 s, the photo when there is one and the name), two levels (owner, 2026-11-10) — « Débutant », the quiz's
  groups, the photo and the name, « Avancé », the right extract and three drawn at random, new each time, the photo alone (the name only for a feature without one) — each its palmarès (`learntest-beginner`,
  `learntest-advanced`); its line of rules and its levels hidden while a run is under way (owner: no time to read them). **The games' palmarès** (owner, 2026-11-10: every game, not only the test;
  `games/palmares.js`, `functions/api/games/scores.js`): a signed-in account's finished runs are kept under its name, for each game and
  level (`spec.key`, the server's `GAME` list) its 20 best and everyone's 20 best, in R2 `games/<key>/u/<account>.json` and
  `games/<key>/top.json` (the account's number kept there, never answered); nothing kept for a visitor, and the best score the
  browser kept (`ocn.games.best`) is gone; a « Palmarès » button beside « Commencer » and « Rejouer » opens both lists; the test's
  ranking (`palmScore`) is the share of right answers, then the mean time a question, its settings shown; account deletion removes
  them; the privacy page says so (10 November 2026). `runGame` now stops a question's clock at the answer (its interval had run on).
- **Santé / Health** (« Nutrition » until 2026-11-01, owner: more general — the name only: the code, the tables `nut_*`, the right
  `users.nutrition` and the route key `nutrition` keep it; `#/sante`, the old `#/nutrition` still opens it), formerly **Nutrition**
  (`pages/nutrition.js`, and its authors' « Rédaction » / Authoring, `#/redaction`, `pages/nutritionwrite.js` — out of the menu since
  2026-11-01, owner: reached by the « Page de rédaction » button of Santé's page, Santé marked in the menu (`menuKey`); Coach,
  after VMA; owner, 2026-11-01): a blog of articles by theme and by date. **Who**: D1 `users.nutrition` (migration 0017: '' / 'reader' /
  'author', the admin page's « Nutrition » column; Nadejda Le Helloco author and Alec Le Helloco reader from the start), the
  administrators always authors (`_lib/api.js` `nutritionRole`, `publicUser.nutrition`, `auth.nutritionReads` / `nutritionWrites`,
  `app.js` `NUTRITION_ROUTES`: neither in the menus nor at their addresses for the others); `NUTRITION_OPEN` (wrangler.toml) "1"
  would let every account read. An author changes and deletes their own articles, an administrator anyone's and gives them to
  another author (one or in bulk); authors and administrators manage the themes. **Storage**: D1 `nut_posts` (HTML body, its
  language, draft / published, a publication date — one to come publishes it that day —, « à la une », cover, words, a version),
  `nut_categories` (`names` per language, the ones not typed filled by the AI), `nut_post_cats`, `nut_translations`; images in R2
  `nutrition/img/<key>` (JPEG/PNG/WebP/GIF, 6 MB, reduced to 1800 px in the browser), served to readers only, deleted with the last
  article showing them. `functions/api/nutrition/[[path]].js` (its header lists the routes). **HTML**: the server strips scripts and
  handlers, the browser cleans it again by an allowlist before showing or saving it (`nutrition/sanitize.js`: tags, links opening
  apart, images only from `/api/nutrition/img/` or https, styles colour / background / alignment). **Reading**: themes and months
  on the left, a search, cards (« à la une » first), an article with its previous / next; translations by Workers AI (`DEFAULT_MODEL`, the HTML kept, markers
  @@TITLE@@ / @@SUMMARY@@ / @@BODY@@), one per article, language and version in `nut_translations`. **Translations** (owner, 2026-11-10, third rule: every article in its original, in English and in French;
  English only from 2026-11-01, every language before — too costly): an article is translated into those of English and French
  it is not written in (`_lib/nutrition.js` `TARGETS`, `translateDue` / `translateSoon`; both at once at publication or change,
  what is missing one at a time behind /api/track and the list, every 10 min an isolate, 40 a day). A reader sees an article in
  their language when its original or a translation of its current version into it is kept, else in English, « Voir l'original
  (<language>) » one click away, the bar naming the language translated from (`translationsFor`, the list's titles too);
  nothing is translated on request any more, nor offered. The translations into German or Spanish made on request before stay in use. A change leaving the title, summary, body and language as they were
  (the date, themes, author…) moves the kept translations to the new version instead of making them again (2026-11-02). The
  « Date de publication » can be changed at any time: a past date backdates the article. **Writing**: « Articles » (filters; ticked ones published, back to
  draft, added to or taken out of a theme, given to another author — administrators —, deleted), « Thèmes » (a name per language),
  the editor (`?id=`, `?nouveau=1`): one ribbon (history, paragraph style, bold… colours, highlight, clear; lists, indents, alignment;
  link, image — also pasted or dropped —, table, line, emoji; a table's rows and columns and an image's width when one is chosen;
  the HTML itself) on `contenteditable` + `execCommand` (Chrome's `insertHTML` drops a `<thead>`: the header cells go in the
  body), the settings beside it, a preview; Ctrl+S saves; an unsaved copy kept in `localStorage ocn.nut.draft.<id|new>` is offered
  back; a change made elsewhere meanwhile (version) asks before overwriting. A summary not typed: the first lines, in the lists only.
  **Alert, likes, related** (owner, 2026-11-01, migration 0018): « Nouvel article dans Nutrition » in Réglages › Alertes, shown to
  the readers only, by e-mail (`users.nut_mail`, off, with the administrator's e-mail right as every alert) and push (`nut_push`, on);
  `_lib/nutrition.js` `announceDue` tells the readers once per article (`nut_posts.announced_at`, taken by an UPDATE … RETURNING),
  the author apart, at its publication or — a date to come — by the first `/api/track` or « Nutrition » list request after its
  day (`announceSoon`, every 10 min an isolate), queued then partly flushed; an article dated over 14 days back is not news.
  Likes: `nut_likes`, one per account and published article (`POST …/posts/<id>/like`), counted on the cards, the article and
  « Rédaction »; no comments (owner). « À lire aussi »: three articles under each, by shared themes (×3), the words their titles
  and summaries share, then the nearer date (`nutrition.js` `related`).
  Imported on 2026-11-01: the 21 posts of Nadejda's former blog Nutriami (BlogEngine.NET XML, comments left out), dated 2009-2012,
  marked announced (no alerts), their categories mapped by name to the 8 themes, the 16 without one given themes by the owner.
  A deleted account's articles stay under the name they were published with. **Copyright** (owner, 2026-11-02): each article ends with
  « © <year of publication> <author's name>. Tous droits réservés… » (`nut.copy`, « Traduction automatique par Ozimut. » when the
  translation is shown, a link to the rules); the rules page has « Santé : articles et droits d'auteur » (the authors keep every
  right and only grant a free, non-exclusive permission to show, translate, excerpt and lay out while published; reproduction by
  others needs the author's permission, short quotations apart) and a « Propriété intellectuelle » line in the legal notices; the
  editor's settings end with the reminder `nutw.rights`. Local test: launch configs `pages-dev-nutrition`
  (8797, the test account an administrator) and `pages-dev-nutrition-user` (8798, not).
- **Mes cartes / My maps** (`#/mes-cartes`, route `myMaps`, `pages/mymaps.js`, Coach's menu after « Analyse de carte »; owner,
  2026-11-01, after the study of the same day, private artifact https://claude.ai/artifact/73o9XNbXo526WspSERhLhR): each account's
  archive of its maps and the routes it ran on them, as DOMA keeps them — a gallery (search, year), a map drawn with its runs (one
  colour each or by pace, the controls placed), its title, day, place and notes editable. **What is kept is what is drawn** (owner:
  « keep what is plotted, not the FIT/GPX »): the map as it came (byte for byte; a PDF's or a generated map's page as a PNG, as
  `mapfile.imageBlob`), and per run its points in the map's pixels with their times (`trace/mymaps.js` record v1: `t0`, `dt` tenths
  of a second, `x`/`y` tenths of a pixel, deltas; `br` segment starts, `laps`, `ctl` the controls), never the trace's file. **Heart
  rate, altitude, cadence (`ch`) only when the runner ticks the box** (off by default; health data on consent), and never through a
  link. A map is kept once per account (`mymaps.sha`, the image's SHA-256): the same map again adds its run. Sources: « Analyse
  solo »'s « Enregistrer dans Mes cartes » (`trace/mymapsave.js`, in the playback's « Affichage » panel: the race's window `offset` …
  `offset + total` of `pxs`/`pys`, the georeference `geoFromFit`), **QuickRoute's JPEGs** (the files DOMA keeps; `trace/mapjpeg.js`
  `readQuickRoute`, written from the format's description — QuickRoute is GPL, none of its code: APP0 « QuickRoute » segments, TLV;
  each waypoint by the matrix of the last handle at or before it, the last but one at most — checked on two real DOMA files, the
  route through the controls; the map cropped out of QuickRoute's header, its route painted on it) and **Ozimut's own file**: a JPEG
  anyone opens (the map with the routes drawn) whose APP9 « Ozimut » segments carry a zip — `ozimut-map.json` (`format:
  "ozimut-map"`, `version` 1: the map's fields, `geo`, the runs' records) and `map.<ext>`, the original map byte for byte —, one map a
  file or all in a zip (« Tout exporter »; personal data only when ticked), read back as it was (`readFile`: a JPEG or a zip of them;
  a newer `version` refused). **DOMA**: no import yet (owner); « Importer depuis DOMA » opens a form (the DOMA's address, the user
  name there, a note) that posts a ready message to `/api/contact` (« Demande d'aide », the account, language and map count). **Sharing**
  (owner: private by default): a link to the whole archive or to one map (`mymap_links`; `#/mes-cartes?partage=<token>[&carte=<id>]`),
  opened by anyone holding it — a visitor without an account enters as a guest (`app.route_`, the guest pass; the gate's `GUEST`
  lets `/api/mymaps/s/…` through) —, showing the owner's name, never the personal channels; deleting the link ends it. **A link shares
  the maps with the routes, or the maps alone** (owner, 2026-11-01: `mymap_links.traces`, chosen before the link is made and changed
  on the link kept, same address; a map-only link lists no runs and refuses them — a QuickRoute map still shows the route painted in
  its picture, which the dialog says). **A map without a run** (owner, 2026-11-01: « Ajouter une carte »; the import takes them too):
  any JPEG, PNG or WebP, a PDF's first page (as a PNG, `mapfile.readMap`/`imageBlob`), a KMZ's image georeferenced by its overlay
  (`georef.kmlCorners`); in a zip only QuickRoute's and Ozimut's JPEGs count (a DOMA folder's « .blank.jpg » would make each map
  twice). **The page** (owner, 2026-11-01, second review: « import files » and « add a map » looked alike): « Ajouter des cartes »
  lists the three ways one a line — Analyse solo first, « Recommandé » (all automatic, no file), a map with its route (QuickRoute's or
  Ozimut's JPEG, the DOMA request beside it), a map alone (a photo, scan, PDF or KMZ) —, open while the library is empty, folded
  after. **Actions on a selection**: each card has a tick box; once one is ticked a bar shows « Exporter la sélection » (one JPEG, or
  a zip), « Partager la sélection » (one map: its link; several: a link to that set, `mymap_links.map_id` « set:<ids sorted> », the
  same set again finds the same link), « Supprimer », « Désélectionner » (a tick updates the marks and the bar only: the cards are not
  drawn again). The head has « Partager ma bibliothèque » (the whole library), whose dialog lists the other links (per map, per
  selection) to copy or delete. No « Tout exporter » any more. **« Rejouer »** (owner, 2026-11-04): each run replays in « Analyse
  solo » (offered on runs only: a map without one has nothing to replay) — `MM.replayGpx` makes a GPX of the run (its points through
  the map's georeference, else a frame of its own, `nogeo`, scaled by the run's kept length over its pixels; its times, the
  personal channels kept) with the `ozimut:drawn` extension of a drawn route marked `replay` (the controls kept, their times — one
  without a time from the run's nearest point, a start or finish missing where the run begins or ends), `pwa.toSolo` hands it and
  the map to the page through the inbox, `?play=1`; there the route is laid by that georeference with nothing read on the map
  (`drawnHere`), source « mymaps » (`track.js`), played at once, neither edited nor cut nor saved again, the visit's other files
  dropped. **No quota for now** (owner). Storage: D1 (**migration 0019**: `mymaps`, `mymap_runs`, `mymap_links`), R2 `mymaps/<user>/<map>/map|thumb|runs/<run>.json`
  (`functions/api/mymaps/[[path]].js`, its header lists the routes; images cached a year: a map never changes under its id);
  account deletion removes all (`api/account/delete.js`); the privacy page's « Mes cartes ». Texts in the area catalogue
  `i18n/mymaps.{fr,en,de,es}.js` (`loadArea("mymaps")`); the Coach guide's chapter `cartes`. Local test: launch config
  `pages-dev-mymaps` (8799); DOMA samples in the git-ignored `site/data/_trtest/mymaps/`.
  **The library** (owner, 2026-11-06: « your very own, private, library of orienteering digital maps, with traces if you wish »):
  each map has a place — **migration 0024** (`mymaps.country` ISO alpha-2, `region`, `dept`: in France the région's name and the
  département's number, elsewhere names as given; the API leaves them out and answers `placed: false` before it) —, and
  `trace/mymapsplace.js` names countries by the browser's `Intl.DisplayNames` in ten languages (folder names « Suede »,
  « Sweden », « SE »; FX, IC… left out: FX took « France ») and France's units from `geo/regions.json` / `departements.json`
  (a département gives its région; a point its département: maps georeferenced in France before 0024 are placed in memory). The
  page: figures (maps, % with a track, countries, regions) for the scope shown and each folder; filters country › region ›
  département › year (`?pays=&region=&dep=&annee=`); folders by place (country › region › département › place) or by date
  (year › month, a year read from the name when no date: « Ball-Trap S 2019 ») or none (`?groupe=`, kept in `ocn.mm.prefs`
  `libGroup`), unfolded in place or entered (`?dossier=` keys joined by « ~ »), a breadcrumb, a filter's level not repeated as a
  folder; beside them on a computer the Agenda's map (`agendamap.mount` with `area`/`missing` keys of its own, `fitDots` on the
  world's map), a map's own position (georeference, else a track's first point) or its département's / région's / country's
  centre (hollow), a click opening the map. Each card has, under the mouse, ▶ Rejouer (the latest run), ✎ Renommer, 💬
  Commenter (the map's notes), 🗑 Supprimer — the same SVG icons before the same buttons on the map's page (`icon()`).
  « Nouvelle carte »: any map file (images incl. GIF/BMP/TIFF, PDF, KMZ, OCAD/Mapper rendered, QuickRoute/Ozimut JPEGs, a world
  file + .prj beside it) and a GPS track; the name from the file, the date from the name or the track, the place from the
  georeference or the track's start in France; name and country required; a track on a georeferenced map placed at once
  (`mymapsimport.runOn`, source « track »), else the map kept with the track's start as its position and handed with the track
  to « Analyse solo » to be calibrated. « Ajouter une trace » on a map's page likewise. **« Importer un dossier »**
  (`trace/mymapsimport.js` `plan`, `importOne`; `<input webkitdirectory>` or a folder dropped anywhere on the page): the format
  shown in the dialog (`mm.fmt.*`) — <country>/<in France a département « 77 - Seine-et-Marne » or « 77 », or a région then a
  département; elsewhere a region, then a province « 28 - Segovia »>/[place folders…]/<map name, a date in it>; a year or date
  folder gives the date; a track of the same name (or starting with it) beside a map is its run —, the folder chosen dropped
  when it is no country; each file outside the format named with its reason and how to fix it (`rootFile`, `country`,
  `frUnit`, `trackAlone`, over 80 MB), other files listed as ignored; then sent one by one (a bar, « Arrêter »), maps already
  kept skipped by SHA-256, and a report (added, already there, failed with why, tracks not placed). Tested on paths shaped like
  the owner's example folder (`P:\Alec\CO\O Maps`: Country / « NN - Département » or region / [place] / name.png, ~530 PNG and
  145 PDF) and end to end with generated maps, a world file and GPX tracks. Rate limit 2 000 maps an hour an account (400 before).
  **Storage, quota, the administrators' collection** (owner, 2026-11-06, after the R2 cost question: 476 MB of the free 10 GB used
  that day; R2 Standard ~$0.015/GB-month beyond, Infrequent Access ~$0.01 + $0.01/GB read and no free tier, so not before ~10 GB):
  `functions/_lib/mymaps.js` — the originals under their own prefix `mymaps-o/<user>/<map>` (before, `mymaps/<user>/<map>/map`,
  still read: `getOrig`), so that an R2 lifecycle rule « Transition to Infrequent Access after 30 days » on `mymaps-o/` can be
  added when the bucket nears 10 GB (not set up); the map's page draws a **viewing copy** (`…/view`, 2 560 px at most, WebP 0.9 /
  JPEG, `MM.viewCopy`, made at saving, else by the page at the first opening) and fetches the original only once zoomed in beyond
  it (1.3 device px a view px), to print, export or replay. **Quota**: 1 GB a library (originals + runs; `MYMAPS_QUOTA_MB`, the
  administrators none), 413 `{ error: "quota" }`, `GET /api/mymaps` `quota { used, limit }`, a figure with its bar, the folder
  import warned and stopped. **Lossless WebP** for every map stored (`mapfile.imageBlob`, so Mes cartes, Solo, the map analyses):
  a PNG, a PDF's page, GIF, BMP, TIFF, OCAD renders kept as WebP when the browser's `toBlob("image/webp", 1)` decodes back
  pixel for pixel identical and is smaller (`losslessWebp`; −36 % on a test PNG; Safari makes none: PNG), JPEG and WebP as they
  came. **The administrators' collection** (`functions/_lib/maplib.js`, `api/admin/maplib`): every map of Solo
  (`solo/<uid>/m/<sha>`), the map analyses (`analyses/<id>/map-<n>`) and the Tracer (`tracer/<id>/map`, never an encrypted
  event's, never its courses) copied to `admin-maps/m/<etag>` (the R2 etag, MD5: one copy whatever the sources), described in
  custom metadata (src, title, day, account, club, position and extent from the georeference — the Tracer's from its controls'
  centroid —, size), thumbnails copied or made by the administrator's browser (`admin-maps/t/`, views `admin-maps/v/`); one place,
  one map (centres within a quarter of the smaller extent, extents within 1.5×, 200 m without extents): the latest kept, the most
  pixels among those within 60 days of it; the others deleted and recorded (`admin-maps/x/`). Synced a few maps a step from
  `/api/track` (every 30 min an isolate) and by the collection's page until done. **« Carte privée »** (owner, 2026-11-06, second
  rule; off by default): Solo's box beside « Enregistrer l'analyse » (one's own map only: `analysis.js` `privOn`, `ocn.an.keepPriv`,
  the analysis's `priv`) and the Tracer's new-event, import and change-of-map dialogs (`privField`, the card's `mapPrivate`,
  summary `priv`) keep a map out of the collection — one copied before leaves it at the next step, unless an unmarked source holds
  the same image. **An account deleted** (owner: « retain the maps in all cases, if making them visible to admins has not been
  disallowed »): its Mes cartes maps, its unmarked Solo maps and its ownerless Tracer events' unmarked, unencrypted maps are handed
  over (`handOver`: `admin-maps/in/<uid>-<ms>.json`, the sources left in place until a step copies them, then deleted), its runs,
  comments and courses go, and the collection's maps lose its name and number (`forgetUser`).
  Shown in « Mes cartes » `?vue=toutes` (administrators: « Ma bibliothèque | Toutes les cartes »), with every account's library
  (read in place, not copied), each card tagged by origin and account, filters origin / account / club, folders by account or club;
  read only, « Fichier d'origine » to download. Admin page tab « Mes cartes » (`?onglet=cartes`): accounts, maps, runs, size against
  the quota, the collection. The privacy page says the administrators may see and keep the maps sent to Ozimut, except those
  marked « Carte privée », and that they stay, nameless, when the account is deleted (6 November 2026; the Mes cartes lede says
  « aucun autre utilisateur ne la voit »). **Mes cartes' « Carte privée »** (same day; migration 0025, `mymaps.private`; the API
  leaves it out before it): the box in « Nouvelle carte », the edit dialog, the folder import (« Importer ces cartes comme
  privées ») and the QuickRoute/Ozimut import, a 🔒 on the card and the map's page; such a map is not in the administrators' view
  and goes with its account. The folder import also leaves out a PDF beside an image of the same name (`plan`'s `dups`: the image
  made from the PDF, the same map; owner's example folder). Local test of the
  quota: launch config `pages-dev-user-quota` (8783, a regular account, 12 MB).
- **VMA** (`#/vma`, `pages/vma.js`, menu « Entrainement » after Jeux; 2026-10-14; every account since 2026-10-15): three tabs (Méthodes first and
  opened by default, then Calculateur; owner, 2026-10-30) —
  Calculateur (demi-Cooper 6 min / Cooper 12 min: laps of a 400 m track in a chosen lane — lane 1 400 m measured 0.30 m from
  the kerb, lane n + 2π(1.22(n−1) − 0.10) m —, a 200 m indoor track or any loop, plus the last lap's metres, or a measured
  distance; VMA = mean speed ÷ the share of VMA held — 100 % over 6 min, over 12 min 95 % « bien entraîné », 90 %
  « modérément entraîné » or 85 % « peu entraîné » (2026-10-29), the level asked explicitly (owner, 2026-10-14: d/200 is the mean speed, not the VMA; no mean
  speed shown) —, VO2max = 3.5 × VMA (Cooper's (d − 504.9)/44.73 agrees within ~3 ml/kg/min at 95 %, higher beyond ~2.9 km; « d ÷ 205 », met
  on French sites with no source, would put the VMA below the speed held: not offered — owner, 2026-10-29; the time held at VMA, 4 to 11 min in Billat's studies, often ~6, and those holding it
  10-11 min estimated at 97-99 % over 12 min, from the usual fall of speed with duration — said, not offered as a level); training speeds and times
  per 200/400/1000 m by % VMA, their uses naming the usual sessions (30/30 and 1'/1' at 100 %, « VMA longue » 3 min at 95 %, 4-6 min
  at 90 %; 2026-10-29); entries kept in `localStorage ocn.vma`), Méthodes (lab, VAMEVAL, Léger-Boucher, demi-Cooper,
  Cooper, Luc Léger shuttle, 45-15), Applications (free, checked 2026-10-14: EZ BIPsVMA web app for VAMEVAL, EPS Test VMA
  for Léger-Boucher on Android and iOS; 20 m shuttle apps apart). Text inline in the module, as on Documentation.
- **The « mise en ligne » alert** (owner, 2026-10-17: from the first results, wherever they appear — the club's site, a results
  platform or FFCO): `notify.run(db, out)` posts FFCO's new competitions (as before) and the races of the last `PROV_DAYS` (4) days
  with an organiser's list of results naming a subscribed runner (the provisional index's `results` flag and `rlics`, the licences
  of the lists of results when they differ from `lics`, which counts start lists too), after every deploy, the weekend's
  `--prov-only` runs included. Each race travels with every id it is known by (FFCO's competition id, its key on « Résultats »:
  `alias`); `/api/notify` mails a race once (it looks up all its ids in `notified`, then records them), FFCO's link when both
  exist, else « Résultats » (`prov`, « résultats de l'organisateur » in the mail). **« Résultats » counts FFCO's results** too: a
  runner's own races are those they are recognised in by an organiser's list or by FFCO's (`data.runnerRaces`), « Avec résultats »
  includes FFCO's, and a race without an organiser's list links to « Courses classées »; the sources column lists the organisers' sources only (owner, 2026-10-18: « FFCO » there repeated the FFCO column), a dash for a race FFCO alone has published; the tile « Avec résultats
  trouvés » still measures the organisers' lists found.
- **« Courses » (« Courses classées » until 2026-10-29, owner; « Relais nationaux » became « Relais » the same day) by link** (`#/courses?id=`, the e-mail digest's link; owner, 2026-10-17): a race named in the address
  brings its discipline (the site-wide one switches, so the list beside it holds it, opened and marked) and, without `circ=`,
  opens on the circuit the signed-in user ran (in runner mode the runner's), else the busiest.
- Tables: a `.table-wrap` (and `dataTable`'s `.table-scroll`) scrolls within the page's height with its header row frozen
  (owner, 2026-10-12: every long table); put new tables in one. **It fits in the window** (owner, 2026-10-22: a table running below the window put its
  scrollbars beside the page's, the horizontal one out of sight — Temps intermédiaires): `fit.js` (`watchTables`, started by
  `app.start`; a MutationObserver on `#main` and the window's width) gives every such box (`.table-wrap`, `.table-scroll`,
  `.scroll-box`, `.agenda-table`) `--table-fit`, the room from its top to the window's bottom with the page at its top, else
  (under ~220 px left) the window less the site's bar, so that it fits once the page is scrolled to it; `--table-max` stays an
  upper bound. A box that overflows gets `fit-over` (a frame, its scrollbars on a track, inset in its card); a box holding
  another gets `fit-outer` and grows (one scrollbar). A box whose page sets `max-height: none` (« En direct ») is left to the
  page's single scrollbar. The race results tables — Courses classées, Résultats, En direct —
  share one format (owner, 2026-10-12): Place, Coureur, Cat., Club, Temps, then per method the CN and the score with its
  coloured gap to that CN beside it (`ui.scoreCell`, `subHead`; the score column sorts by the gap). **Frozen columns** (owner,
  2026-10-24: « freezing the right columns across the site »): the columns that say whose row it is stay in view when a wide table
  scrolls sideways — on a computer the leading narrow ones (tick box, place, rank) and the name after them, on a phone the narrow
  ones only (a table starting with a name keeps it on both, capped at a third of the screen; a runner's races: the day and the
  competition, on a computer only). `table.data` with `data-freeze` / `data-freeze-phone` (app.css « Frozen columns », up to 3;
  `ui.freezeAttrs(n, phone)`); `ui.dataTable` picks them from its columns' keys (`autoFreeze`: `rank|place|pos|rownum|sel|i`, then
  `name|nom|comp|club|runner`; `freeze: [n, phone]` overrides); hand-written tables tag themselves (Analyse de course's Tableau 2 / 1,
  its name-first views 1 / 1, Analyse multi's splits, Comparer's face-à-face, Résultats' list and start list); `fit.js` measures
  where the second and third stick (`--fz2`, `--fz3`, from the header row's widths — a stuck cell's position moves with the
  scroll). Opaque cells, the row's tint `--row-tint` over them, a line after the last; « En direct » keeps its own (`--lv-tint`).
- Navigation (superseded on 2026-10-30 by « The four modules » above; owner, 2026-10-12; « Entrainement » and « Organisation » added 2026-10-14/15; « Courses » first and the agenda as
  every signed-in account's landing page since 2026-10-21, `app.homeOf`, the brand's link too): the bar shows the groups as tabs —
  « Courses » (Agenda, formerly « Bientôt »; Résultats, formerly « Récemment »; En direct; Analyse de course, 2026-10-23), « Classement » (« Classement national »
  until 2026-10-15; Coureur, Classement, Courses classées = `#/courses`, Comparer, Clubs, Statistiques = `#/reseau`), « Entrainement »,
  « Organisation »; a group's tab leads back to the page last seen in it
  (`localStorage ocn.nav.<group>`) — a list or a view, never a tool that reopens its work (the analyses, « Direct », « Tracer »:
  `TOOL_PAGES`) nor a `?fen=1` address (owner, 2026-10-17: the memory is shared by the tabs, and « Courses » reopened « Analyse
  solo » at its calibration in full window, the menus gone; a stale memory is ignored when read). The row under it shows the current group's pages. The runner search sits at the right
  end of the page's tab row (`app.placeSearch`, `.tabs-row`) on Coureur, Classement and Comparer only (`SEARCH_IN_TABS`). One's name opens a menu: Ma page, Documentation = `#/methodes`, Réglages, Nous écrire,
  Administration, Déconnexion. On a phone the menu button lists both groups under headings (`app.renderHeader`).
- **One method at a time** (owner, 2026-10-12): `store.method` (default `official`; `store.methods` = `[method]` for the
  pages that read a list), chosen with the switch at the right of the header's second row (`ui.methodSwitch`: « Calcul du
  CN » then Officiel | Top, each with a one-line tooltip `m.<method>.tip` — owner, 2026-10-13: the buttons alone did not say
  what they chose —, a list of every available method for analysts; `?m=` in a link sets it; « En direct »'s race page draws no switch in the bar but one button
  beside its status, owner 2026-10-21: compact on a phone — the race's name once, the latest punches one line each, the course
  picker, then the table with no heading of its own); no page has a method choice of its own
  (the former `methodChips`/`methodSeg` draw nothing). After a switch the runner's CN chart shows the previous method as a
  faint grey line (`store.prevMethod`, this visit only). The results tables (Courses classées, Résultats, En direct, the
  runner's race history) show one CN column and the score with its gap; En direct: the official CN at J-15, the others'
  of today, the circuit valued with `VALUER` (Top: the Fit of the same mean). The Documentation still compares methods.
  The runner's « Historique du CN » tab is the selected method's (owner, 2026-10-14; one history, not two): FFCO's
  published history read live for the official CN (`runner.drawFfHistory`), the computed window's entries and exits for
  a Top or Fit (`cn.cnHistory`), exits struck through in both.
- **Nothing moves on a change of selection** (owner, 2026-10-12/13): a switch of method, or another runner picked on the
  Coureur page (the search, a name or a node in its « Réseau »), redraws the page in place (`app.redraw`, `goInPlace`):
  same tab and settings, no loading screen, the scroll positions kept; the back button returns to the previous runner.
- **Themes** (owner, 2026-10-12/13): five, from the lightest to the darkest — Jour (`light`), Clairière (`clearing`, the pale
  yellow of open land), Forêt (`forest`, the map's light green — a light theme since 2026-10-29, owner: the grey-green
  half-light it was looked grey), Sous-bois (`undergrowth`, dark green, deeper the same day), Nuit (`dark`) —, each its own token
  set in `app.css` (`:root[data-theme=…]`; Clairière and Forêt keep Jour's series, Sous-bois shares Nuit's series and landscape;
  the system's dark mode reaches none of the light themes), chosen under
  the moon button (`app.js` `THEMES`, `themeMenu`: a swatch of each theme's ground and one colour of its own; `localStorage
  cnx.theme`); by default Sous-bois on a computer, Clairière on a phone (`index.html`: a coarse pointer and ≤ 900 px; owner,
  2026-10-31 — light and dark until then).
- **Look** (owner, 2026-10-12): orienteering colours used mildly (`app.css` tokens `--flag`, `--forest`, `--water`,
  `--contour`): « Classement » in the map's forest green, « Courses » in its water blue (`body[data-group]` →
  `--grp`: the group's dot and tab in the bar, the current page in the row under it, the active tab's underline), the main button
  (`.btn-primary`) in control-flag orange, contour lines behind the header's second row (`app.drawContours`, 2026-10-13: a
  relief of a few hills drawn on a canvas by marching squares in the map's brown, an index contour every fifth line, as on
  the study's page; redrawn with the bar and on resize). Logo (owner, 2026-10-19; the logo study, private artifact https://claude.ai/artifact/CSyWqbeCtWjFoLamUgwhsM, proposal 6): a
  compass bezel — a ring with four ticks — and, as its needle on a bearing of 45°, the control flag's two quarters of the
  former hourglass (top-right orange, bottom-left in the text colour); outlines always drawn last, over the fills (app.js
  `.brand-mark`, favicon.svg, tour.js; the PNG icons and badge drawn by the study's scratch `make_mark.py`; e-mails: the
  mark as `assets/mail-mark.png` beside the name with its orange O, an orange button).
- **Lean pages** (owner, 2026-10-12): where the title only repeats the menu (Classement, Courses classées, Comparer, Clubs,
  Statistiques, Agenda, the lists of Résultats and En direct: `app.isLean`), `app.leanHead` drops the title line: the page
  starts with its tabs, its buttons go to the right of the tab row (`.tabs-actions`), its text is the tooltip of its name
  in the second row (`NAV_HINT`). The runner's, a club's and a race's names stay as titles, as do Documentation and Réglages.
- **One head for every page** (owner, 2026-10-12): `.page-head` = the title, a short text on its right (`.lede`; under it on a
  phone; the runner's and the club's facts as `.lede.meta`), the action buttons at the far right, then the tabs. Pages whose
  views change the text (Statistiques, Clubs) give it `id="page-lede"` and the views call `ui.setLede` (`netmodes.netHead`
  does); no view repeats a title of its own.
- **Tabs, not long pages** (owner, 2026-10-12): a page with several sections shows them as tabs (`ui.pageTabs`,
  `tabFrom`, `bindPageTabs`: panels `data-panel`, the tab in the address as `?onglet=`, kept by `replaceQuery`; charts
  drawn hidden are resized when shown). Coureur (Courses, Calcul du CN, Historique du CN — its own tab since
  2026-10-14 —, Progression — the « Évolution du CN » chart first, then the progression against the age category: one tab
  since 2026-10-14, owner; old `?onglet=evolution` links open it —, Saisons, Carte — the map
  of the races per département —, Réseau — the runner's network, `network.ego`, moved from Statistiques on 2026-10-12;
  `link.network(lic)` and the old #/reseau/<licence> open it), Club, Comparer, Classement, Comparer des clubs, Clubs, the results panel of Courses
  classées; Statistiques' views (`netmodes.js`: Réseau des meilleurs, Territoires, Participation, Âges)
  and Temps intermédiaires' views use the same tab bar; Statistiques and Clubs switch their views in place under one head
  (`network.render`, `netmodes.modeHref`; `clubs.render`: Clubs, Ligues, Comparer des clubs, Simulateur de relais, Mon club
  — the club's page `club.js` as a view, owner 2026-10-14 —, and the open club's name when it is another club's page; the
  routes `clubcompare`, `relays` and `club` load clubs.js; the address follows by pushState). The tab bar is always right under the
  page's head, above shared filters and tiles (owner, 2026-10-12); a view's own tabs under it are smaller. Do the same for new pages. No count of
  compared runners in the navigation (owner, 2026-10-12).
- **Analyse** (`#/analyse`, `pages/analysis.js`, menu « Courses » after En direct; administrators only from 2026-10-13, every account since 2026-10-15:
  the nav entry and the route gate check `me.admin`): a runner's GPS trace on their own map for a race of « Résultats »,
  played back as Livelox does. Everything is read in the browser (`trace/`), nothing sent; only the controls' positions
  are kept (`localStorage ocn.an.cal.<race>.<doc>.<circuit>.<runner>.<WxH>`). Files, dropped together: the map (image,
  a PDF's first page through pdf.js (vendored), or a KMZ with its image), the trace (`trace/track.js`: GPX with
  Garmin's extensions, TCX, **FIT** — definition/data messages, compressed timestamp headers, developer fields skipped;
  channels altitude, heart rate, cadence, temperature, power), and optionally the map's georeferencing (`trace/georef.js`:
  KMZ/KML GroundOverlay with LatLonBox + rotation or gx:LatLonQuad; a world file + .prj, Lambert conformal conic and
  transverse Mercator inverted on GRS80, the system guessed from the numbers without .prj — Lambert 93, UTM) and an IOF
  XML 3.0 CourseData (Purple Pen, OCAD, Condes: the courses, the controls' codes and order, MapPosition in mm matched
  to the circles found by `geom.registerPoints`, Position lat/lng when the map is georeferenced). OCAD and Mapper files
  are read since 2026-10-24 (drawn by the Tracer's `tracer/vmap/`, georeferenced by their own grid; see « Computed route choices »).
  **Calibration, automatic** (owner, 2026-10-14: the clicks were too tedious, and split times are not always published):
  `trace/course.js` reads the course printed on the map — purple mask (hue 265-338°, saturated), control circles by a
  Hough vote at 20 radii on a 4 px grid, each peak refined by the share of the ring that is purple (tolerant score with
  a pixel of tolerance to accept, raw score to pin radius and centre; hollow inside, clear outside; the finish = the
  larger circle concentric with one; nearly complete rings of a control's size accepted whatever sits inside, since the
  start is often drawn in the finish), the leg lines (a straight purple run of 2.2 r* through the pixel), a control =
  a circle a line reaches (digits' loops dropped), the start = the purple blob, or a circle's centre, scoring best
  against an equilateral triangle (orientation, size, centre searched). Then `trace/align.js`: without georeferencing,
  the similarity (rotation, scale, translation) that makes the trace run through most controls — RANSAC on pairs of
  Douglas-Peucker corners × pairs of controls, scored in a chamfer distance field of the trace, the best 40 refined by
  ICP; scale bounded by the circle radius (2-3.5 mm at 1:3000-1:15000), rotation ± 30° when « carte orientée au nord »
  (a photo may need it off); then `visitOrder`: each control's passing time (closest approach), the visiting order, the
  start's departure, the finish's arrival; two passes within 15 s are one control. The published split times, when
  there are any, refine everything: detected passes paired to the official times by a DP (gaps allowed, the clock shift
  re-estimated from the pairs, outliers > 60 s dropped), then `calibrate()` = least-squares similarity + the trace's clock
  offset searched to 0.1 s (georeferenced map: the geometry is kept, only the offset searched). Without splits the
  trace's own passes give the times (legs table « d'après la trace », the start from the triangle's departure, else the
  finish's arrival minus the official total time). The user can correct anything by hand (« Corriger à la main »:
  clicks snap to the circles found, 3 points suffice without splits). Measured on synthetic data (scratch
  `gen_test2.py`: a map with the course, a 7°-rotated JPEG « photo », GPX/FIT traces with 5 m drifting GPS noise built
  from a real race's splits, KMZ, world file + .prj, IOF XML): automatic calibration 5-7 m, rotation found to 0.5°,
  12/12 controls on the clean map, 9/12 on the photo (the rest placed by hand or by the DP's gaps), all georeferenced
  inputs 7 m with the clock offset to 0.1 s. Playback: trace plain or by pace, runner with a tail, play/speed/jump by
  control, « suivre », the strip under the map (pace, plus one channel — heart rate by default), the legs table (times,
  class best, rank and time lost when published; trace vs straight distance; pace; mean heart rate and cadence).
  **Real photo** (owner's Fougères night-champs photo + FIT, 2026-10-14, 960 × 1280 px): the magenta ink photographed in
  poor light is a dark plum (r and b above g, low saturation) — the mask accepts it; thick purple (titles, class names)
  is removed by an opening before the Hough vote (`thinOnly`, 1.5 line widths; the line width is the lower quartile of
  runs); the vote floor is 8 % of the strongest peak (a letter's bowl can be the strongest); a ring needs tolerant ≥ 0.8
  or (tolerant ≥ 0.55 and raw ≥ 0.5), hollow and clear; a control circle never overlaps the start/finish symbols; the
  start triangle's sides (2.1 r*) survive the line test only with runs of 2.9 r*, and a triangle a leg line leaves beats
  the control descriptions' own start symbol. Once the trace is laid, its sharp turns with no control nearby are
  **probed** for faint rings (`course.probe`, `probeTurns`) and the alignment redone; with ≥ 6 controls the fit becomes
  affine (a photographed page is skewed). Result on that photo: 6 rings read + 4 probed of 16, fit 6 m, scale 0.47 px/m,
  the rest placed by hand (clicks snap to a ring found on the spot; « Ajouter un poste » when no split times exist; the
  trace's visiting order renumbers them, two passes within 15 s are one control); a hand-placed point counts as reached
  within 30 m. **The overprint read as ink, not hue** (owner, 2026-10-31: 8 of 16 found on that photo): `course.js`
  `inkMask` — each pixel's optical density over its local background (a 9 px closing per channel), the overprint's ink =
  green absorbed beyond the mean of red and blue (the same over white, yellow or green, the lighting divided out; the
  photo's purple is a pale greyish lavender, one side faded by blur); a ring must also be the overprint's colour
  (`ringColour`/`purpleRing`: red and blue absorbed alike) and empty inside (`inkInside`: a magenta hatching makes rings);
  then a second pass on the continuous ink field at r* (`ringCandidates`, `ridgeRing`: a ridge in most of 24 sectors, in
  arcs of 20° or more, no straight line across — `lineAcross` —, the controls' own colour), and `probe` uses the same
  test (`{ loose }` for a click). Measured (scratch `eval.mjs`, kept with the session's scratch): that photo 13/16 read +
  start (14/16, start and finish on the page with the FIT, fit 6 m); the « Entrainement Gif » course drawn on its scanned
  map clean 24/24 + finish, as a phone photo 24/24 (3 before), badly degraded 12/24 (0); no false control on any, nor on
  two maps without a course (2 before); probes at random spots 3 false rings in 150 (16). Leg-line ends as evidence were
  tried and dropped (crossings and digits make ends). **The course's order is read on the map, the trace only times it**
  (owner, 2026-11-01: « the trace should not define control numbers »; its visiting order had numbered 8 before 5, 6, 7 —
  run past between 4 and 5): `course.js` `followCourse` follows the legs from the start triangle (`legIn` = the share of the
  way between two symbols inked, 1.3 r* left at each end: the photo's true legs 0.78-1.00, other pairs ≤ 0.42; the nearest
  symbol joined, a control before the finish, the triangle's tip for the first leg), and back from the finish until the two
  ways meet (a leg, or circles under 2.5 r* apart: no leg is drawn between overlapping circles); at a dead end `alongLeg`
  follows the inked run leaving the control (not toward a symbol placed, nor along the leg that came in) to the first ring
  on it or a symbol read; back from the finish `ringOnWay` also looks for a ring on a leg (`legRing`: weaker evidence —
  score + arcs ≥ 0.8 — but the course's colour, empty, no line across). `course.order({ finish })` reads it again with the
  finish the page placed where the trace ends; `reversible` when the start is drawn in the finish (two legs leave it: the
  tips cannot tell, measured 0.4-6° apart on the synthetic maps) — the page takes the way round the trace runs. The pages:
  `analysis.js` `courseOrder` (controls no leg reaches slotted in by their pass time), `mapOrdered` kept with the
  calibration, `align.passesInOrder` times them (each control's pass so that times rise along the course: most controls,
  then least cost; a control with no pass within 1.5 tol takes one within 2.5), a control added by hand goes where its pass
  falls; Analyse multi's circuit editor takes the map's order first (no trace needed). `align.visitOrder`'s `leg` option
  stays for maps without a start. Measured: the photo S, 1-15, F in order (15 found along the 14 → 15 leg; 16 placed by
  hand lands as 16), the synthetic map and photo and the GifCure course clean and as a phone photo all in order or
  reversible; no false control. Control numbers read as digits (templates of six fonts on the ink blobs): 1-14 legible,
  the faint or overlapping ones misread — not used. 16 stays unread (a dark arc over the lake, its colour shifted, a
  ring score at the threshold of the map's texture); a click there keeps its place (`probe`'s `loose` snaps to a faint
  ring only within 0.5 r* of the click; it took one 18 px away).
  Tried for 16 and dropped (2026-11-01): reading the legs' rings on the green absorbed beyond the red alone (the overprint
  over yellow keeps it; 15's whole circle and 16's arc show) — it lights black and brown lines too, ring-like spots all
  along the 14 → 15 leg, and the chain invented five controls on the photo (scratch `course_m2_tried.js`). **A calibration
  made by an earlier reading** (`course.READER`, kept as `reader` with it; the owner saw 1-14 and no 15 from the one of
  before) comes back with a note and « Refaire le calage automatique » beside « Corriger à la main » (`olderReading`).
  Without split times the race clock is the runner's published start time, looked up in every list of
  the race (liveresultat's gives it when the organiser's does not), else the start symbol's departure, else the finish
  less the published total. The finish on the lake
  (purple over blue) cannot be read. `window.anDebug()` in the console returns the fit, offset, targets, detection,
  view and `place(x, y)` for support and scripted tests. Playback settings (owner, 2026-10-14): the trace's width
  (« Trait »), the map's and the trace's opacity, the curves under the map as toggle chips (pace plus any of the
  file's channels, each on its own scale), « suivre » off by default, all kept in `localStorage ocn.an.prefs`; the
  view opens zoomed on the race's trace (⤢; ▭ = the whole map); during the playback the pickers and the files card
  give way to one line (« Course et fichiers ▾ » opens them above the display, which stays; changing a choice there
  starts a new calibration). No « Recaler » and no « Postes » box on the display (owner, 2026-10-14): the calibration
  is finished and approved (« Voir la course ») before it, and the rings are drawn only while calibrating. **The calibration's
  actions in a bar** (owner, 2026-10-25: « Voir la course » was out of sight at the bottom of the side panel's scrolling text):
  the panel (`.an-side.an-cal`) scrolls its text only (`.an-side-body`), every action — « Voir la course », « Corriger à la main »
  / « Refaire le calage automatique », the manual mode's buttons, « Choisir <runner> (facultatif) » — sits in `.an-actions`
  under it, on a phone fixed at the window's bottom; choosing the runner the trace fits is optional (`an.switch.hint`: it adds
  their published times, else the race is read on the trace alone). The clock runs on a timer, not on
  requestAnimationFrame, which a hidden pane pauses. **Memory between visits** (owner, 2026-10-14): the files and the
  work stay in memory while the site is open (`memo`: a visit to another page and back finds them), the files are
  also kept in IndexedDB (`ocn-analyse`) for the tab's session (a tag in `sessionStorage ocn.an.tag`: a reload
  recovers them, a new tab does not; « Oublier les fichiers » drops them), the race/circuit/runner in
  `sessionStorage ocn.an.sel` (the menu's link carries no query), and a calibration is saved in localStorage with its
  geometry and a `done` flag (v2): it comes back as it was left, hand-placed controls included — **ready, not played**
  (owner, 2026-10-15: going straight into the playback hid the files, which could no longer be replaced): the page opens
  on the files and the calibration, « Voir la course » plays it. A calibration belongs to its trace (`traceSig`: start
  time and points; a cut trace's fit was reused for the complete file): another trace starts afresh. Files dropped
  anywhere on the page, on the map during the playback too, replace the current ones (an overlay says so).
  « Refaire le calage automatique » starts afresh. **Playback layout** (owner's review,
  2026-10-14): `body.an-theatre` hides the steps, the page head and the footer — the site's menus stay as on every page
  (owner, 2026-10-15: the second row hidden and the group's tab turned into a menu confused users), and the race's line
  (« Course et fichiers ▾ », the race, runner and files with the trace's length) sits in the map's top left corner
  (`showPanels` moves `#an-brief` into `.an-map`); the map and the side panel take
  `100vh − 252px − var(--an-strip)` so a desktop screen needs no scrollbar; the side panel is a compact list (transport,
  slider, stats as dt/dd, « Affichage » folded: trace colour with swatches and a picker, width, by pace, tail,
  opacities). Trace colour default dark purple `#3b0764`, width 2.4, the part to come at 0.45 alpha; by pace
  colours the whole race, with its legend in the map's bottom right corner (`paceLegend`: the 8 colours, the paces
  where they start, rapide → lent; owner, 2026-10-15). The curves are stacked rows, all of the file's open by default
  (the former default, pace + heart rate, counts as unset), each with its scale (owner, 2026-10-15: unusable without):
  the name and unit, round ticks on a value axis (pace at round min/km, its slow end capped at 20 min/km; labels never
  overlap; owner, 2026-10-15, « cadence: only 0 and 100 »: a tick every ~16 px of a row, the range from the 2nd to the 98th
  percentile rounded to the ticks, and for pace, cadence and power from the moments in motion only - above 40 % of the
  median - so that a stop at a control touches the floor instead of stretching the scale), the value at the cursor, and a shared race-time axis; altitude green, power orange, temperature gold;
  cadence explicit (owner, 2026-10-15): watches record one foot's strides or a bike's pedal turns, so on foot it is
  doubled to « pas/min », on a bike kept in « tr/min » — the activity the file names (FIT session/sport/lap `sport`,
  TCX `Sport`, GPX `trk/type`: `track.activity`), else foot unless the race is a VTT one (`cadence`, once per track,
  after the race is matched). The legs
  table and the numbered ticks only when the sequence is known complete (`sequenceKnown`: published splits or an IOF
  course) — numbering the controls found would mislead. The view opens on the first leg (`zoomTo(legs[0], 2.4)`);
  « Suivre » is a toggle button in the transport row; moving the map by hand turns it off, paused too (it snapped back to
  the runner). A published start time is ignored for a `dns` runner or when the
  first control's pass precedes it or comes over 30 min later. **The race of the trace** (owner, 2026-10-15: « stops at
  25:01 », then « nothing until control 7 » — the page opens on the account's latest race, a sprint of the next day where
  the owner ran 25:01, and Nadejda's night trace took that time as the race's length, then its start from the finish less
  25:01): a runner's published times apply only when the trace is of the race's day and their published start falls in
  the trace (`timesApply`; else the race is read on the trace alone and the page says why, `timesNote`). A trace dropped
  for another race switches to the race of its day and the runner whose run fits it at both ends (`runFit`: the trace
  covers the published start and start + time, the least slack wins — the start alone took Romane, one minute apart,
  for Nadejda), else the account's run that day (`matchRace`, « Course choisie d'après la trace »). The views fitted on
  the trace (⤢, the first leg) keep it below the race's line in the map's corner (`topReserved`), and wait for the map
  to have a size (`pendingFit`: a zoom of 0 could not be undone). **Layout, second review** (owner, 2026-10-14): the top
  menu stays during playback (hiding it saved no height) and `an-theatre` is removed in the page's cleanup — it had
  stayed on every page; the layout is a grid filling the window (`--an-h`, `fitHeight`), the curves on the left
  (default ≥ 1100 px) or under the map (« Affichage › Courbes »), collapsible (‹ or double-click on the splitter), the
  splitters resizing the curves and the side panel (`--an-gw`, `--an-gh`, `--an-sw`, kept in `ocn.an.prefs`), drags
  followed on the window; the map keeps its centre on a resize (`lastBox`); « Affichage » open; the first leg at
  margin 1.15 + 30 px; `fitTrace` restored (dropped by c00a655: ⤢ threw during playback). The race's length: the published
  time, else the finish's arrival, else the trace's end — never the last control found (it cut Nadejda's race at
  56:31 of 1:01:39 when the finish, over the lake, was not read). The trace still to run is hidden by default
  (« Trace à venir : masquée / estompée »); the trace colour shows only for the plain trace, under that choice.
  **A trace cut short** (owner, 2026-10-15: « the trace stops before control 5 », three times — the file the page had
  ended at 26:16 of the 1:01:39 race; reproduced exactly with the FIT cut there): nothing can show what the file lacks,
  so the page says it — the one line of the playback gives the trace's own length beside its name, and the calibration
  and the playback say « le fichier de trace semble incomplet » when the trace ends a minute or more before the published
  time, or over 200 m from the finish placed (`traceShortNote`). A cut trace can also be laid wrongly (24° on the cut
  Fougères FIT: the RANSAC fits all the rings to the first half of the race).
  **The finish's arrival** (owner, 2026-10-14: the race stopped at 25:01 near control 8, far from the finish): with only
  the first controls found, a finish read (or placed) where the course runs past it gave a mid-race « arrival ».
  `track.finishArrival` (used by `visitOrder` and `coursePasses`) takes a pass by the finish as the arrival only if the
  runner then stays within 300 m of it and stops running (the trace ends within a minute, or the next minute is run at
  under 60 % of the two minutes before); else the last such pass; else none — the race then runs to the trace's end
  (shared analyses: the first pass after the last control when every control was passed). Without a start, the race
  clock is the earliest control passed (it was the first in the list, not in time: the race began 26 min into the trace).
  **Map resolution** (2026-10-14): `detectCourse`'s tolerances are in pixels and were tuned on the owner's photo at
  960 × 1280 (overprint line 3 px); a phone's photo at 3000-4000 px read at 1800 px gave 4 px lines and the title's
  letters as rings (21 « circles », the trace laid at 18°). The image is now read at the size that makes the measured line
  width 3 px (`lw > 3`: scaled by 3 / lw): the ×2 and ×3 copies read as the original, the synthetic maps unchanged.
  **The finish's double circle** (owner, 2026-10-14): ISOM draws it 5 and 7 mm across around 6 mm control circles, so
  both rings come out near a control's size — the finish is now any two concentric rings 1.25-1.6 times apart (the
  outer-only rule kept as a fallback). On the owner's photo it is not purple at all (over yellow it comes out brown,
  over the lake dark blue, a building and a path across it): `course.probeFinish` reads the lightness ray by ray (light,
  dark ring, light, dark ring, light; 36 rays, half of them and three quarters of the circle), colour-blind — found at
  2 px, score 0.75. Shape alone is not unique on a forest map (texture, knolls' contours: up to 0.72 elsewhere on the
  same photo), so it is only looked for within 50 m of where the trace ends (`prepare`, the circuit editor's `auto`).
  **3D view** (2026-10-24, owner: after the study of World of O's 3DRerun; on main since that day, commit da06beb, every account and
  visitor of « Analyse solo »; « prototype » dropped from its labels on 2026-11-01): « 3D » on the playback's map (`an-3d`) drapes
  the map over the ground. **Also in « Analyse multi » and the Tracer** (owner, 2026-11-01: « make this 3D thing available to all,
  bring it to analyse multi and to the tracer »): `view3d.open3d` takes one trace (`track`, Solo), several (`traces: [{ track, i0,
  i1, colour, label }]`, `now()` → each one's time or null) or none (the Tracer), `setTraces`, `setFollow(true | "chase" | "group" |
  false, k)`, `setStyle({ colourOf(i, k), …, traceAlpha })`, `fitTrace(pxBox)`, `setImage`. « Analyse multi » (`shared.js`, « 3D »
  with the map's tools): every runner shown, in their colour with their initials (`initials`), each one's route in the view's one
  frame (`rcmFrame`, the points through the map's pixels: `track3d`), on the replay's clock (`now3d`, the mode's `sAt`); a leg's view
  draws its leg and reframes; « Suivre » the selected runner chases them, « tous les coureurs » keeps the orbit's centre on the group;
  the colours as the 2D's (runner, pace, leg time, variant); the heights the computed routes' grid (`heights3d`, one load for both);
  « Exagération du relief » under « Affichage » (`ocn.sh.prefs` `ex3d`). The Tracer (`tracer/relief3d.js`, ribbon Carte › Affichage
  › « Vue 3D », `view-3d`): the course shown — the map and its overprint by `exports.courseImage` (its print area clipped to the map,
  `clip`), at most 6144 px (4096 on a phone) — over the heights read at the event's georeference (`geo.toLatLon`; a map without one
  gets a message naming « Géoréférencer »), over the map pane, its exaggeration in `localStorage ocn.tr.ex3d`, Échap or ✕ closes it;
  the course's controls framed. Checked locally on « Test UI club » (four runners, a leg, pace colours) and a generated sprint map
  of Fougères. The heights:
  `trace/terrain.js` lays a grid on the map image (its nodes at map pixels, so the image is the mesh's texture as it is; ~40 000
  nodes, a step of 5 m at least, 320 a side at most: `gridPlan`), each node's lat/lon through the calibration (`pxLatLon`: the fit to
  the trace's metres, then the trace's own lat0/lon0), from IGN's RGE ALTI in France (`elevation.json` POST, 5 000 points a request
  at most, about one a second asked — three at a time here, no refusal seen; a 7 × 7 probe first sends a map mostly outside IGN's
  model to the tiles; IGN's holes — Monaco, the sea, a border; values under −50 m are its sea — filled from the tiles: source
  « ign+tiles ») else the AWS terrain tiles (Terrarium PNGs, ~30 m, zoom 15 at most); only the map's extent is sent, never the trace;
  kept in IndexedDB `ocn-analyse` (keys `dem:v2:…`, the last 12). The view: `trace/view3d.js`, three.js 0.185.1 vendored
  (`vendor.THREE`, loaded only when the view opens; no OrbitControls — its bare `import "three"` needs an import map — so a small
  orbit of its own): the ground mesh lit softly from the north-west, the texture reduced to 4096 px on phones and small screens
  (8192 elsewhere); the trace a ribbon whose two edges each sit on the ground (a level ribbon sank into steep slopes), coloured as in
  2D, the part run, the tail, the part to come faint or hidden; the runner a dot the same size on screen, seen through hills; the
  camera an orbit (drag, right/Shift-drag or two fingers to move, wheel or pinch) or, with « Suivre », a chase camera behind the
  runner turning with their heading, never under the ground; vertical exaggeration × 1-3 (`ocn.an.prefs` `ex3d`). It runs on the
  2D playback's clock (`clockNow`: interpolated between the timer's ticks), draws on requestAnimationFrame only when something
  changed, and goes with ↗ (`d3=1`) and full window. The credit of the heights' source in the view. Measured 2026-10-24 (headless
  Edge, Intel GPU, the invented test files): IGN grid 181 × 121 nodes at 5 m in 4.2-5.3 s (5 requests), 232 × 174 at 8.7 m in
  12.6 s by Monaco (IGN + tiles), cached: at once; 60 fps at 1280 × 800 and on a 390 × 844 phone viewport (pixel ratio 1.5), under
  1 ms of CPU a frame; three.js 751 KB (187 KB gzipped), the three modules 47 KB. `window.anDebug3d()` gives the grid and the
  frame stats. **The map's own contours** (`trace/contours.js`, « Relief › + courbes de la carte (essai) », off by default; the
  owner's question): a brown mask (red strongest, green about half, blue low and under green), thin lines only (course.js's
  opening), pieces ≥ 12 m long and across; each piece's level from the model along it, tied to its neighbours (pieces crossed one
  after the other along rows and columns step by what the model says: 0, ±1 or ±2 intervals; index contours, ~1.6 × wider, every
  fifth interval), the offset from the model's own heights along the lines; the surface = the model + a correction exact on the
  lines, a membrane between them solved coarse to fine. Measured on synthetic O-maps drawn from IGN's 2 m heights (5 m contours,
  index lines, paths, text, boulders, overprint; scratch `site/data/_trtest/contour-exp/`, git-ignored), RMS error to IGN's model
  with the mean bias removed: over the 30 m tiles, Vosges (250 m of relief) 4.36 → 2.52 m, Vercors (170 m) 7.03 → 4.61 m,
  Fontainebleau (26 m) 3.93 → 3.84 m (unbroken lines: 1.61, 3.74, 3.51); over IGN at 5 m nothing gained (0.34 → 0.27, 0.33 → 0.96,
  0.07 → 0.06) — in France the contours are mostly drawn from that same LiDAR; small features (knolls, re-entrants: the height
  less its 40 m mean) never better than the model (the membrane terraces between lines, a level off by one makes a step). On real
  maps (Purple Pen's OCAD tests rendered, against their own vector contours): Penistone Hill 97 % of the pixels read are contours,
  87 % of the contours read; Clouds 80 / 81 %; Ft Casey (1:5000) 86 / 77 %; twice as many pieces as contour objects (paths and text
  break them); Lake Sammamish's brown renders as rgb(128, 0, 0) and is not read. Not done: form lines (dashed half-interval lines,
  read as full contours), a map's brown learnt from the map itself, vector sources (OCAD/OMAP through `tracer/vmap/`, symbols
  101-103, or a PDF's brown paths: exact lines, the next step), Analyse multi.
- **The analyses' playback layout** (owner, 2026-11-01: « the map is the key and should always be fully visible », « never need to
  scroll down on a large screen »; supersedes the layout notes above for « Analyse solo » and « Analyse multi »): the controls above
  the map (`.an-bar`: the race's line, play, speed, follow, the time slider, ⤢ ↗; Solo's figures of the moment on a second line —
  time, leg, pace, distance, the file's channels, ⚠ for a cut trace —; Multi's start mode, kept in a leg's view, the time line then on the leg and a start mode chosen going back to the whole course (owner, 2026-11-07: before, the leg and « ← Tout le parcours » took the mode's place); the leg at the map's bottom left in both analyses (`.an-legchip`: Solo the leg opened, else the leg the runner is on, « 3 → 4 » — Solo has the same leg view since 2026-11-07, owner: a row of « Inter-postes », whose first row is « Tout le parcours », opens it, the time line and the playback on the leg alone, ⏮ ⏭ from leg to leg, `legSel`, `span()`, `setLegView`; Multi the leg opened with the icon « Revenir à tout le parcours », `ICONS.course`, or the leg waited at in « Attente aux postes »), both in « Aide » (owner, 2026-11-05: the leg is chosen in « Inter-postes », whose first row is the whole course and which marks the leg shown; the start mode's explanation its tooltip; « Ajouter ma trace » in the top line, left of the access)), then a panel of tabs
  on each side of the map (every tab with a tooltip saying what it holds, `tip`; the legs tables' explanation a tooltip on the table, not a paragraph above it — owner,
  2026-11-05; Multi's « Itinéraires » starts the computation when opened and shows its progress or failure while it has no route, lists every leg computed with « Tout le parcours » first and the leg shown marked, as « Inter-postes » does; a leg opened from either is framed whole and stays so until played — `still` —, a followed runner no longer recentring it on the first control; a leg's whole block in « Itinéraires » opens it, not only its name; « Voir le terrain tel que lu » draws on any view and « Carte des décisions » shows the leg shown, else the followed runner's leg (`runLeg`), else says to choose one; in « Analyses », « Écarts » names its runners above the chart (`.sh-gap-key`) and a point opens the leg into its control (`jump`), any cell of « Temps intermédiaires » opens its leg, an exercise chosen is framed whole, a whole-course corridor is scored from the runner's closest pass to the line's start to the one to its end (`exRoute`), and a cap's column is « Près de la ligne » (all owner, 2026-11-05); « Calcul » (`routeplan.panelHtml`, both analyses) keeps to what a user can judge: the map's kind, « Ajuster l'allure, la montée et les vitesses sur les temps des coureurs » before the pace, the climb and the terrain speeds it greys (`.rc-calgroup`, a typed pace dropped), the caution, the variants, the decision map and the terrain as read; no OCAD picker, « Lignes noires fines » (always automatic), relief (always the map's contours) or interval (2.5 m sprint, 5 m forest: `loadSettings`, `reliefGrid`), the status line only while computing; `trace/sidepanel.js`: `panelHtml`, `bindPanel` — tabs, a fold button ‹ / › that leaves a rail of the
  tabs' names, a click there reopens on that tab —, `bindSplitter`): Solo left « Courbes » (the curves), « Inter-postes » (the legs'
  table, when the sequence is known), « Itinéraires » (administrators: the computed routes leg by leg, the current leg marked and
  brought into view, the runner's own route measured on the same model — time, length, climb — with Choix and Exécution); right
  « Affichage », « Calcul » (administrators: the routes' settings). Multi left « Coureurs », « Inter-postes » (one runner's legs,
  `sharedviews.legsPanel`; a tab of its own since 2026-11-04), « Analyses » (sharedviews' other views, formerly a card under the
  map), « Itinéraires » (administrators), « Mes courbes » (with one's own trace); right « Affichage », « Calcul », « Export ». **« Export »** (owner, 2026-11-05: the third tab on the right of both pages): Solo's image export and « Enregistrer dans Mes cartes » moved there from « Affichage »; Multi's draws the map as the replay shows it at that moment (the part in view or the whole map, north up, at the map's resolution, lines in the map's mm, `drawOver`), with a title and the runners' colours, and holds « Mes cartes » for one's own run (from the left panel). The personal-data box names the channels with values over the race, and only then (`mymapsave.personalOf`). Solo's trace width reset once to « épais » as Multi's (`wv`). **Solo laid out as Multi** (owner, 2026-11-05, same evening): the top line (`#an-top`, `.sh-top3`: what is played, on an organiser's map its access `sh.access.*`, ⤢ ↗), the controls over the map's column only (`.an-mapcol`: the crosshair « Suivre » — `sidepanel.PAN_ICON`, shared —, transport, speed, time), no « Course et fichiers » in the playback (the files are the step before; files dropped still replace them), and under the map the « ▾ Allure » bar with the moment's figures (leg, pace, distance, the file's channels) over the race's pace curve (`trace/pacestrip.js`, the controls marked, a click seeks; « Allure sous la carte », prefs `strip`). Multi's same bar shows the followed runner's figures, else those of the one runner shown (`stats()`: race time, leg, pace, distance). Multi colours by altitude and slope too (`HEIGHT_BY`): the terrain model's heights under each route (`heights3d`, `heightAt`; the shared traces keep no altitude), its legend saying so. **Aligned further** (owner, 2026-11-05, late): Solo opens on the whole map with « Suivre » on, the runner followed only once played or the time moved (`still`, `opening` refitting while the panels settle; a leg clicked is framed whole until played); both « Affichage » say « Trace » (Multi's options worded as Solo's, « par allure »…) and have « Parcours sur la carte » (Solo: off where an organiser's circuit is printed or the course was read on the map; `trace/coursedraw.js`, shared), no « Allure sous la carte » (the bar's ▾ does it); Multi's « Mes courbes » tab is « Courbes »; the image's zone « la vue affichée », « la course » or « toute la carte » on both; **one runner's colour chosen** in Multi as Solo's trace colour (owner, 2026-11-07: « Couleur de la trace » under « Trace » when one runner is shown and the routes are coloured by runner, kept per analysis in `localStorage ocn.sh.col.<id>`; Multi's « Affichage » in Solo's order: Trait, Trace, its colour, Orientation, Trace à venir, Traîne, the opacities, Parcours sur la carte); Multi's heights for altitude, slope and slope-corrected pace load from IGN the first time (~10 s, then IndexedDB): a bar in the legend; **preloaded 1.5 s after the opening** (owner, 2026-11-07), one load shared by the colours, the 3D view and the computed routes (`heights3d`, `rcm.gridP`); **the pace corrected for the slope** (`pacecolour.gapSpeed`, mode `gap`: the computed routes' slope model, 8 m on the flat a metre climbed — Solo from the watch's altitude, Multi from the relief). **Map tools in one order** on both (3D, +, −, ⤢, ▭, 📏, 🎥) and the headcam video in Solo too (`sharedvideo.js`, its runner's select only with several, its offset per trace `ocn.an.video.<traceSig>`, read when a video is opened; the organiser's `video` switch). **Solo analyses kept** (owner, 2026-11-05, second rule the same evening: « Voir is not saving », and saving an analysis is not « Mes cartes »): a box « Enregistrer l'analyse » beside « Voir la course » (ticked by default, `ocn.an.keep`; on an organiser's map, where a dropped trace plays at once, in the files card; unticked, the playback's top line offers the same button) under the name in the field beside it (`an.keep.name`: prefilled with the race's or the map's name, the name kept before for that trace; a calibration made again keeps the name it has, a rename included — the server's PUT keeps an empty title's old one) sends the map — once per account, by its SHA-256 — and the run as drawn, positions and times only, to **`/api/solo`** (`functions/api/solo/[[path]].js`, R2 only: `solo/<user>/a/<id>.json` with its summary in custom metadata, `solo/<user>/m/<sha>` and `.thumb`; its header lists the routes; account deletion removes `solo/<user>/`), through `trace/solokeep.js` (`save`, `list`, `remove`, `load`); never a replay, nor where the organiser's `mymaps` switch is off; a calibration made again replaces the analysis kept for that trace (`ocn.an.kept.<traceSig>` { id, cal }, checked against the list: one deleted elsewhere is kept again). « Mes cartes » keeps only what « Export »'s box saves there. « Analyse de carte » lists the kept analyses as type « Solo » (`s:<id>`, their owner's alone, every country), the card's box « Analyse » holding three small buttons side by side (owner, 2026-11-05): « Rejouer » — `#/analyse-solo?analyse=<id>`, which opens straight on the playback (`openShown`: the files and the calibration hidden under « Ouverture de l'analyse… » until it plays, 20 s at most; also for « Mes cartes »' « Rejouer » and a « ↗ » tab) —, « Renommer » (`PATCH /api/solo/<id>` `{ title }`: the summary rewritten, the record copied unread; `GET` gives the current title in `X-Title`) and « Supprimer » (its map goes with the last analysis showing it). The runs « Mes cartes » got from the first rule (a few hours that day) stay there. Panel widths remembered per analysis (Multi `ocn.sh.lay.<id>`, Solo `ocn.an.lay.<traceSig>`). The side panels' tabs stay on one line (cut with « … », their tooltip whole; « Calcul de route » is « Calcul »). The privacy page says so. **Every analysis
  opens with both panels unfolded, on « Inter-postes » and « Affichage »** (owner, 2026-11-04; Solo's curves while its sequence is
  not known — `sequenceKnown` also counts the course's order read on the map, `mapOrdered`, since that day —, `sidepanel.bindPanel`
  showing the tab asked for as soon as it is offered); **a map analysis opens on its whole map, filling the map's area** (owner, 2026-11-05: it opened on the runners gathered at the start), fitted again as the panels settle until the reader moves it, the runners followed once the replay is played or its time moved (`still`; an address naming a time or a leg keeps its view); the widths are kept in the pages' prefs (`gw`, `sw`; Multi `lw`, `rw`), the
  folds and tabs only for the visit; the layout fills the window below its top (`fitHeight` / `fit`), the panels scroll on their own. Solo's
  « courbes sous la carte » choice is gone. **The control bar lies over the map's top edge on a computer** (owner, 2026-11-07: the
  map a strip taller; from 901 px, app.css): across the map's whole width, half-opaque, the map's tools, the measure's box and the
  north arrow lowered under it (`--bar-h`, kept by `sidepanel.floatBar` as the bar wraps); the views fitted and the runner followed
  keep below it (`mapView.setInset`, Solo's `topReserved`); a phone keeps it above the map. **Under 900 px the panels are drawers over the map** (owner, 2026-11-06: they were
  stacked under it): the map's column fills the window below the top line, each panel slides in from its side over the map
  (`sidepanel.drawers()`, app.css; width the layout's less 64 px, 380 at most), both slid away at the opening; a handle on the map's
  edge (`.sp-handle`: an arrow and the tab shown) slides it in and back, as does the panel's ‹ / ›; one open at a time (`sp:close`);
  the map's tools moved clear of the right handle. The pace under the map is a bottom drawer there (`.sh-bottom`: « ▴ Allure » and
  the moment's figures on one line over the map's bottom edge, the curve sliding up; folded at the opening, `stripArrow`), and the
  layout's minimum height drops to 200 px (a phone held sideways). **The top line** (owner, 2026-11-06): « Carte », « Analyse des
  temps » and « Ajouter / Remplacer ma trace » carry an icon (`sidepanel.ICONS`, `iconLabel`) before their words on a computer, in
  their place under 900 px (their title says them), where the line is one line and drops who may open it; its right part never
  wraps, so « ⤢ » is always the top right corner (who may open it cut short instead); **no « ↗ » in the analyses**
  (`fullwin.buttons({ tab: false })`; the Tracer keeps its own). **« Aide »** (Help, Hilfe, Ayuda; « Légende » until 2026-11-06 evening, owner) (owner, 2026-11-06: a phone shows no tooltips), the
  right panel's last tab in both analyses (`trace/legend.js keyHtml`; texts `lg.*`): every button and icon of the page drawn as there,
  its name and what it does, by place (top line, the bar, the map, the panels — the phone's handles or the computer's ‹ ›); the map
  analysis adds its views, « Ajouter ma trace », its start modes, the « Suivre » column and the times marked « ~ » (read on the
  trace, no published time: `sh.time.est` their tooltip, `lg.timeEst`). Every icon button has a tooltip (the zoom's
  + −, ▶, the speed, the start control too). Full window also hides the line back to « Analyse de carte » (`.ma-crumb`). **« Carte seule »** (owner, 2026-11-10): the button
  left of « ⤢ » in both analyses (`sidepanel.mapOnlyButton` / `setMapOnly`, `body.map-only`, app.css) slides the left, right and bottom
  panels away — on a computer their grid columns close (animated only under `body.mo-anim`, so a splitter never lags), the panels keeping
  their width and sliding out over the layout's edge, the pace bar down under the map's bottom; on a phone the drawers, their handles and
  the pace bar out of the map's edges — the control bar kept; again, everything as it was (widths, folds, tab, a drawer open). For the
  visit, not kept; « Aide » has it (`lg.mapOnly`); the map analysis's split times lose their panels too while it is on.
- **Generated maps** (owner, 2026-11-01, after the question of MapAnt-like maps: a prototype, administrators only, in « Analyse
  solo »): for a trace without a map in metropolitan France, « Générer une carte d'après le LiDAR (essai) » (files card,
  `genBlock`/`genMap`). The map: IGN's LiDAR HD point clouds (COPC LAZ, Licence Ouverte 2.0; each 1 km tile's addresses from IGN's
  public WFS `IGNF_LIDAR-HD_METADONNEE:metadata`, its download service taking one request a second) through **karttapullautin**
  (GPL-3, MapAnt's tool: release v2.15.4 downloaded and checked against its checksum, run as a program of its own in batch mode —
  each tile with its neighbours' edges —, never bundled in the site or the repository; allowed by the owner), then OpenStreetMap's
  roads (502/503), tracks, paths and small paths (by `trail_visibility`/`informal`), buildings, water, walls, fences, railways and
  power lines drawn over it in ISOM 2017-2 at 1:10 000 (`mapgen/osm.py`, the Overpass API, two servers tried in turn; tunnels and
  sidewalks left out; © OpenStreetMap contributors, ODbL, said under the files and on the map, `.an-gen-credit`). A tile: 2362 px at
  0.42333 m (karttapullautin's 600 dpi) from its north-west corner, ~200 KB; beside it IGN's MNT every 2 m (500 × 500, Terrarium,
  ~310 KB) for the 3D view; a tile without LiDAR yet: `{none: true}`; without OpenStreetMap a tile fails rather than be kept without
  its roads. **The flow**: the page sends the ids of the tiles its trace's area (+ 150 m) touches (≤ 12; never the trace) to
  `functions/api/lidarmap/[[path]].js` (POST; admin), which answers the tiles R2 holds (`lidarmap/t/<id>.png|.dem.png|.json`) and
  writes a request for the others (`lidarmap/req/<id>.json`, 20 a day an account) and starts `lidarmap.yml` (workflow_dispatch with
  `GH_DISPATCH_TOKEN`; without it the request waits for a run started by hand); the workflow makes the queued tiles (≤ 16 a round,
  rounds until none waits) and writes them and the requests' outcome to R2; the page asks `?req=` every 15 s, then puts the tiles
  together over the area (`trace/lidarmap.js` `compose`: every second pixel past 30 Mpx) and takes them **as dropped files** —
  `ozimut-lidar-<tiles>.png` + `.pgw` + `.prj` (Lambert 93) —, so the calibration, the files kept for the visit and « ↗ » work as for
  any georeferenced map. A map with nothing on it (no course read, no control placed) plays the whole trace (`recompute`: the start
  at the trace's beginning; before, « Voir la course » waited for a start). **3D**: on a generated map the view's heights are the
  tiles' MNT (`lidarGrid`, source « lidar », credit « IGN – LiDAR HD® »), at once instead of IGN's elevation service. Measured on
  the PC (2026-11-01): karttapullautin 13 s a km² alone, 4 km² in 60-77 s in batch with 4 processes; a tile's point cloud ~250 MB
  (1.3 GB in 143 s); the Fougères forest's 9 tiles put together in ~2 s (3072 × 4457 px), the trace on OpenStreetMap's roads within
  a few metres; Fougères' old town: buildings, streets, squares, the river and the ramparts' slopes.
  **Two styles** (owner, 2026-11-01, the same day: « the sprint style for both Analyse solo and the Tracer »): a tile is made in the
  style asked (`run.STYLES`): `<id>.png` in ISOM 2017-2 at 1:10 000 (`osm._forest`) and `<id>.s.png`
  in ISSprOM 2019-2 at 1:4 000 (`osm._sprint`: streets, squares, parkings and paved footways as paved area 501, brown 30 %, at their
  width on the ground — OSM's `width`, else by class, `STREET_W` —; paved or not by OSM's `surface`, else by class, `paved`; unpaved
  paths as 505 or 506; buildings grey 50 % (521), canopies 522 — `building=roof|carport` —, walls impassable 515, retaining walls and
  fences passable, stairways hatched 532; the symbols' sizes in mm at the style's scale, `_Canvas.mm`). **Each style has its own
  karttapullautin run** (owner, 2026-11-01 evening, « do you use karttapullautin at all for the sprint mapping? »; `run.KP_STYLE`, in
  `work/<style>/`, its `out/` emptied first — the batch mode skips a cloud whose render is there): the forest one as before (5 m
  contours with form lines, at 1:10 000); the sprint one `formline=0` (2.5 m contours, index every 12.5 m), `scalefactor=0.4` (drawn
  at 1:4000: 600 dpi there is 0.16933 m a pixel, so contours, cliffs and depressions 2.5 times finer on the ground) and
  `remove_touching_contours=1` (a rampart's slope came out solid brown); OpenStreetMap drawn on that fine render (the ground's fill
  reads its exact colours, which averaging blurs: a white mesh through the olive), then the whole brought to the tile's 0.42333 m by
  Lanczos. 42 s a tile for the sprint render on the PC against ~13 s for the forest one. The tile's JSON lists its `styles` and their
  versions `v` (`run.STYLE_V` = the API's `STYLE_V` = `lidarmap.js`'s: forest 1, sprint 2; a record without `v` counts its styles
  as version 1, so the sprint tiles of before — the forest render under sprint symbols — are made again); a run keeps the other
  style's entry (`run._versions`: the workflow syncs R2's tile records to `known/` first). A request carries its `style`; a round of
  the workflow makes the oldest request's style, the other style's requests wait for the next round. The tiles' addresses carry
  `?v=<version>` (cached a week). The API answers a tile ready only in the style asked and its version (`POST { tiles, style }`).
  **Contour interval by standard, helper contours, thinning** (owner's review as a mapper, 2026-11-12: « less of a black box,
  faster »): each style also at its other interval — ISSprOM 2 or 2.5 m, ISOM 2.5 or 5 m, never 5 m for sprint (`run.INTERVALS`,
  the default first) —, a **variant** with files of its own (`<id>.sprint-20.png|.vec.json|.vege.png|.help.json`, `forest-25`; the
  defaults keep their names), its version in `VARIANT_V` (run.py, the API, trace/lidarmap.js; **sprint 3**: its contours had been
  every **0.5 m** — karttapullautin draws, without form lines, a contour every `contour_interval / 2 × scalefactor`, measured; now
  `contour_interval` = 2 × interval / 0.4, `indexcontours` 5 × interval: `kp_settings`), asked as `POST { tiles, style, interval,
  helpers }` (a request's `variant`; a round of the workflow makes one variant). **Helper contours**: karttapullautin's « basemap »
  contours (`basemapinterval`, absolute, measured: 0.5 m under 2-2.5 m contours, 1 m under 5 m), DXF layer `cont` without heights,
  simplified 0.15 m into `t/<id>.<variant>.help.json` (dxf.py `HELP_TOL`; ~0.3-1 MB a tile), the record's `help` {variant: interval};
  `helpers: true` makes a tile without them again. **Thinning**: `thinfactor` from the clouds' LAS headers for ~`THIN_TARGET` 6
  points a m² (France 0.14-0.19). Measured on the PC (Gif-sur-Yvette's town tile, 29 points a m²; Fontainebleau's forest, 42): a
  tile 40 → 22-30 s and 55-74 → 47 s — karttapullautin's LAZ reading (~35 s for 42 M points) stays, the rest ~5 times faster —,
  vegetation and contours as with every point (the owner found 10 % enough), small cliffs fewer (20 → 5-19 on the forest tile);
  COPC octree levels as thinning were tried and dropped (they bias the green: half the forest turned dark green). The record's
  `kp` {variant: settings used} and `kpv` (karttapullautin's version; `kp` was that string before). « Analyse solo » offers the style beside the button (sprint by default for a race whose name says so),
  the files named `ozimut-lidar-sprint-…`. The shared steps — ask, wait, put together — are `lidarmap.make(area, style, say, stop)`.
  **The Tracer's base map** (use case 4): « Nouvel événement » has, for administrators, « Pas de carte ? Générer une carte d'après le
  LiDAR (essai) » (`pages/tracer.js` `genHtml`/`bindGen`): no base map to pick from (no third-party map in the site), so the area is a
  square of 0.5-3 km round a centre — the chosen competition's place from the agenda (`agendamap.where`: its GPS, else its town,
  « approché »), the device's position, coordinates typed (« 48.3912, -1.1734 », or with decimal commas and « ; »), or a trace's
  extent (GPX/FIT/TCX, `lidarmap.areaOf` + 150 m) —; **the style asked first** (owner, 2026-11-01 evening: « ask the user if Sprint
  or Forest mapping is required, before the tool is used »: « Type de carte », Sprint — ISSprOM 1:4000, contours every 2.5 m — or Forêt
  — ISOM 1:10 000, every 5 m —, nothing chosen beforehand, « Générer » refused until one is, `trc.gen.needKind`), the event's map
  standard following it (Sprint 2019 / ISOM 2017). The map image
  becomes the event's map file at its scale (1:4 000 sprint, 1:10 000 forest) and dpi (25.4 × scale / px: 240 and 600), the event
  georeferenced from its world file (`geo.geoFromWorld` in Lambert 93) and the credit put on the map as a black text object
  (`trc.gen.credit`, all courses). Checked on Fougères' old town at 1:4 000: 3.99-4.00 m on the ground a map mm.
  **A Tracer bug fixed on the way**: the field mode's floating panel (`team.js`, a `div.tr-field`) and every dialog's field
  (`dialogs.field`, `label.tr-field`) shared one class, and the panel's `position: absolute` (since 2026-10-15) sent the new-event
  dialog's fields to the window's bottom; the panel's rule is now `div.tr-field`.
  **Sprint's ground** (owner, 2026-11-01, « fill sprint open land »; `osm._ground_fill`, on the LiDAR render's land pixels only —
  its white, pale yellow and greens; contours, cliffs, water untouched): public lawns, parks, commons, grassland (`landuse` grass,
  village_green, recreation_ground, meadow…, `leisure` park, common, garden) turn the LiDAR's open land into open land 401; pitches and
  playgrounds are 401 wherever nothing grows; olive 520 for ground marked `access=private|no`, private gardens (`garden:type`), and
  the unbuilt, unwooded ground of `landuse=residential` blocks within `NEAR_HOUSE` (20 m) of a building — the gardens behind the
  houses —, except a `KERB` strip (3 m beyond a street's band, paved: the sidewalk to the façades) and public open land; wooded
  ground stays the LiDAR's (a garden's trees cannot be told from a public wood). Sidewalks mapped as their own ways
  (`footway=sidewalk`) are paved bands, and a street's `sidewalk=both|left|right` widens its band by 1.5 m a side. On Fougères' old
  town: courtyards and back gardens olive, sidewalks paved, the lawns and the pitch yellow; part of the wooded slope below the
  ramparts (its unwooded patches) and the castle's grounds come out olive — a residential polygon covers them. Each run keeps its
  Overpass answer in the work folder (`osm_<first tile>_<n>.json`); `MAPGEN_OSM_CACHE=1` reads it back, to try a style without asking
  Overpass again (it answered in 3-8 minutes, or not at all, from the PC on 2026-11-01 evening).
  **Progress shown** (owner, 2026-11-01: « wherever requests to IGN, OpenStreetMap or running karttapullautin may take time,
  progress bars or hourglasses »): `site/assets/js/waitbar.js` (`bar(frac)`, `setBar`, `elapsed`; not `progress.js`, the runner
  page's age-category progression) — the browser's own `<progress>`, its value the share done, none while unknown (the browsers
  animate it: the hourglass), styled `.wait-bar`. The map generation: the workflow reports its stage and share done
  (`run.Progress`: lidar 30 %, karttapullautin 35 %, OpenStreetMap 20 %, drawing 15 % of the bar; downloads and tiles counted,
  karttapullautin and Overpass by 1 − e^(−elapsed / their usual time, `KP_EST`, `OSM_EST`), which never claims to be done) into the
  request's record on R2 every 10 s (`ci --progress-to`, the workflow's aws CLI), `GET /api/lidarmap?req=` returns it, and
  `lidarmap.make` shows the stage, the share (92 % of the bar, putting the tiles together the rest) and the time waited, every 2 s
  (`an.gen.stage.<stage>`, `an.gen.waiting`; an hourglass before a run starts) — in « Analyse solo »'s files card (updated in
  place) and the Tracer's « Générer » line (`#tr-gen-bar`). The 3D views' relief (Solo, Multi, the Tracer) show the IGN or tiles
  load's share in their note, and the Tracer's status bar puts a bar before every busy state (`E.status(msg, "busy", frac)`; the
  climb from IGN course by course).
  **North lines** (owner, 2026-11-12: « add them to the other LiDAR maps too »): `lidarmap.compose` draws them over the tiles put
  together (`northLines`), so every generated map has them, its tiles made before included, and no tile is made again: blue,
  every 300 m in the forest style (30 mm at 1:10 000, 0.27 mm wide) and every 80 m in the sprint style (20 mm at 1:4000, 0.18 mm),
  on the grid's round values and parallel to its north, as Virtually's LiDAR maps (no declination model: the grid's north stands
  for the magnetic one). The computed routes still take them out (`routechoice.northLines`: runs up to 4 m wide, spacings from
  75 m, each line fitted through its runs — the vote's angle was 0.4° off on a 6 px line and left half of it read as water).
  Cartographier's tile backgrounds have none: a map drawn there gets its own from « Mise en page ».
  Not done: passability of OSM's fences, karttapullautin's black marks for walls and embankments in town, tiles made again when OpenStreetMap
  changes, edges between tiles made in different runs (possible seams); **route choices on LiDAR layers: never for runners** (owner: a
  route is chosen on the race's map, not on data the runner did not have) — possibly one day for setters in the Tracer, not now.
- **After QuickRoute** (owner, 2026-11-01: QuickRoute's features compared; its manual route adjustment not wanted, the automatic
  calibration being stronger; an archive of one's traces and the import of QuickRoute JPEG / DOMA archives studied apart), in
  « Analyse solo »: **the trace coloured by any measure** (« Affichage › Trace »: plain, pace, heart rate, altitude, slope — the
  altitude's change over the distance run in ± 10 s —, cadence, power, temperature, those the file has; `trace/pacecolour.js`
  `colourModes`, `seriesOf`, `rangeOf` — the pace's 10-90 %, the others' 5-95 % over the race, cadence and power when moving, the
  slope even about 0 —, `colourOf`, `legendOf`; low in blue, high in red; the 3D view the same); **« Exporter une image »**
  (`exportImage`: the map with the race's trace as displayed, at the map's resolution, 40 Mpx at most, the race's part with a
  margin or the whole map, PNG or JPEG, a title — race, runner, day, time, distance, pace — and the legend drawn in; the line
  0.4 mm × the width chosen, a millimetre read from the control circles; saved on the device, nothing sent; settings in
  `ocn.an.prefs` `shotZone`, `shotType`, `shotLegend`); **« Couper la trace »** (`track.cutTrack`: the part kept in the whole
  trace's frame, its time from 0; in the files card only — owner, 2026-11-01: « Couper avant le départ » / « après l'arrivée » /
  both, 10 s kept, once the calibration has found the start's departure or the published start and the finish's arrival or the
  published time (`raceEnds`, `cutEnds`, redrawn by every `recompute`), and sliders over the whole trace's pace for the rest; kept
  per trace in `localStorage ocn.an.cut.<ms0 s>:<points>`, so a file dropped again comes back cut — the card's title says so; the
  calibration in hand is saved for the cut trace, geometry included — its geometry still holds; the record the automatic
  calibration saves has none yet, and a cut at mid-race laid the part kept afresh, 29° off — and a cut made from the playback's
  « Course et fichiers » goes back to it).
- **After RouteGadget** (owner, 2026-11-02: RouteGadget's features compared; its archive import left out). **A route drawn by hand**
  (`trace/drawroute.js`), for a runner without a GPS track: « Dessiner mon itinéraire » in « Analyse solo »'s files card (any map;
  **never in « Analyse multi »**, owner 2026-11-02: comparing it with real traces would not be fair — Multi refuses a drawn GPX and the
  API a trace carrying a drawing, and leaves out one shared in the hour it was allowed) — the start, then each turn; a click within 1.3 r of a control's circle (read on the map, the
  organiser's, the circuit's) points it, Shift + click never does, « Le prochain point est un poste » forces one, « Arrivée ici » ends
  it (a click on the finish too); then the controls' times: the published split times when their count is the drawing's, else typed
  (the finish's at least; the others spread by the distance drawn), the day and start time when nothing is published. The route runs at
  an even pace between two timed points, one point a second (`timeline`, `sample`). Solo makes it a **GPX** (`toGpx`) taken as a
  dropped file — its `ozimut:drawn` metadata extension (namespace `https://ozimut.com/gpx/drawn/1`, read by `track.js` into `tr.drawn`,
  source « drawn ») keeps the drawing, the map's size and the georeference used, so the page lays it back through that georeference
  (`drawnHere`), times its controls by the drawing (offset 0, `tEst` from the timeline), never smooths its distance, and « Modifier le
  dessin » edits it again. A map without georeference gets a frame of its own round (0, 0) (`ownGeo`, `nogeo`: no GPX download), its
  scale the straight course drawn over the course's length typed (else the class's `length_m`), else the circles (7.5 mm at 1:10 000
  forest, 6 mm at 1:4 000 sprint). **« Coller aux chemins »** (`snapDrawing`): each leg laid by the computed routes' engine
  (`RC.planner(...).match` = `routechoice.matchRoute`: the fastest way within 30 m of the line drawn in forest, 15 m in sprint, the
  corridor widened once across what reads impassable; the map read once per drawing, its overprint released round the controls), the
  controls and times kept, a leg it cannot place left as drawn; « Revenir à mon dessin » restores the sketch (`drawing.raw`); open to
  every account, though the engine's computed routes stay the administrators'. **A comment on one's race**: Multi's « Mon commentaire »
  (the trace record's `note`, 1 000 characters, `PATCH /api/analyses/<id>/trace/<n>`, kept when the trace is replaced), shown under
  the runner's name; Mes cartes' run comment (**migration 0022**, `mymap_runs.note`; written when « Analyse solo » saves the run, read
  and edited under the run, carried by Ozimut's file; before the migration a run is saved without it and editing answers « not
  ready »). **« 📏 » Mesurer** (`trace/measure.js`): clicks lay a line, its length by the calibration (Solo) or the circuit's
  georeference (Multi), at its end and in a box at the map's top; the button or Escape ends it. **The map turned to the leg**
  (« Orientation de la carte », north up by default, `orient` in the prefs): Solo the leg being run, Multi the leg shown or the
  followed runner's; the turn is applied about the canvas's centre after the view, which stays north up (`mapView.setRotation`,
  `unrot` for the pointers, `fitPoints` / `zoomTo` measure as turned), a north arrow in the corner. **Multi open to visitors**: an
  analysis open to every account may also be opened to visitors without an account (`meta.visitors`, « Ouverte aussi aux visiteurs
  sans compte »); visitors read it through `GET /api/analyses/v[/<id>[/map|traces/<n>]]` (the gate's `GUEST`, with the guest pass),
  only the traces whose runners agreed (`visitors` in the record, custom metadata `vis`: a box unticked by default when sharing or
  drawing, or under one's comment) and without licence; « Analyse de carte »'s first tile lists those events to visitors; the privacy
  page says so. **Score courses** (the circuit editor's « Score », `course.score`): the passes are each control's first visit wherever
  it comes (`share.scorePasses`), no legs (the leg views, variants, exercises, the « from » and « wait » modes, the turn), no leg lines,
  and « Analyses » shows each runner's controls in the order run (`sharedviews.scoreView`).
- **« Depuis mon téléphone » / From my phone** (owner, 2026-11-03: a computer had no camera button): on a computer
  (`phonelink.offered`: not a coarse pointer) a button beside the files shows a QR code (`phonelink.js`, qrcode-generator 2.0.4
  vendored, `vendor.QRCODE`, black on white whatever the theme) — « Analyse solo »'s file card (map and trace; the organiser's
  map mode a trace only), « Mes cartes »' « Ajouter des cartes » (its import dialog takes over), « Analyse multi »'s circuit
  editor and its « Ajouter ma trace ». The phone opens `#/envoi/<id>.<pk>` (route `phoneSend`, `pages/phonesend.js`; no account,
  open to the signed-out in `app.route_`): « Photographier la carte » (rear camera) or any file, sent as it is (never reduced),
  with a progress bar. `functions/api/phone/[[path]].js` (public in the gate; its header lists the routes): a link is made by an
  account or a guest-pass holder (40 a day), lives 15 min (`LINK_MIN`), two keys — the phone's sends (8 files, 60 MB each), the
  computer's reads; R2 `phone/<id>.json` + `phone/<id>/<n>`; the computer asks every 2 s, takes each file once (deleted at once)
  as if dropped (`onFiles`), the link deleted when its dialog closes; links an hour past their end swept at each new link, and R2's lifecycle rule « phone-transfers » (prefix `phone/`, 1 day; added with the owner's go-ahead) deletes what is left.
  Tested locally (an image and a GPX from a phone-sized tab into Analyse solo, Mes cartes' import; the keys refused crossed).
- **Organisation › Direct** (`#/orga-direct`, `pages/orgdirect.js`; every account since 2026-10-15, owner — administrators
  only the same morning): an organiser feeds « En direct » from their timing software without liveresultat. **The page in three steps** (owner,
  2026-10-25: the MeOS and the file instructions were one block, « Le jour de la course » read as MeOS's too): 1. the race, 2. the
  sending — « Votre logiciel » MeOS | another (an exported file), only the chosen way's instructions and controls shown (`showVia`,
  `ocn.direct` `via`; default MeOS once it sent to the race) —, 3. « Résultats » after the race (the competition tied, « Publier
  maintenant »); the GPS tracking card apart; texts `content/orgdirect.*.js` `overview`, `meos`, `file`, `after`, `common`. The software exports
  its result list to a file every few seconds; the page, open on the arena PC in Chrome or Edge (File System Access API: the
  file is chosen once, its handle kept in IndexedDB `ocn-direct`, a reload asks one click), re-reads it on a timer run in a
  small Worker (hidden tabs slow their own timers), reads it in the browser (IOF XML 3.0 by its own reader `iofLive`, which
  keeps the runners still out and their splits; OE / MeOS HTML by `localparse.parseBytes`), turns it into liveresultat's
  compact class form (`toLive`) and posts only the classes that changed to `/api/live/push?id=`. Nothing is declared
  beforehand: classes, controls and runners come from the file. A broadcast is opened by name, date and organiser
  (`/api/live/broadcasts`) and numbered from 900 000 000 (liveresultat's ids are far below), registered by the live server's
  `Directory` object; each race is a `LiveRace` object that, for such numbers, never reads liveresultat and keeps what is
  pushed (one storage key per class), pushing changes to the pages watching as for a liveresultat race. O'CN reaches both
  objects through Durable Object bindings to its live relay `ocn-live` (`live/`) (`wrangler.toml` LIVE_RACE, LIVE_DIR) at internal paths (`/push`,
  `/broadcasts`) that no public route forwards (`functions/_lib/live.js`). Any account opens a broadcast (10 a day at most),
  and only the account that opened it, or an administrator, feeds it (`by`, the account's id, is never sent to others: the
  list says `mine`); the page lists one's own. « En direct » lists the last 3 days' broadcasts that sent something (and
  one's own before their first send; all to administrators). Local test as a regular account: launch config
  `pages-dev-user` (8792, ADMIN_EMAILS overridden). The live relay
  (`live/`) is deployed by hand. Local test: launch configs `ocn-live-dev` (8786) and `pages-dev-games` (8790; the local Pages
  dev binds to the running relay); `iofLive` / `toLive` are exported for checks.
  **MeOS pushes itself** (2026-10-22, after reading MeOSDjango — GPL, ideas only; MeOS's own `onlineresults.cpp` /
  `infoserver.cpp` read for the protocol): MeOS's service « Résultats en ligne » (« Online Results », tab « Services ») posts the
  MeOS Online Protocol (MOP 2.0: `<MOPComplete>` then `<MOPDiff>`, in chunks of 64 elements, zipped above 1 KB by default) to
  `/api/live/mop` (`functions/api/live/mop.js`, public in `_middleware.js`: no session) with headers `competition` (the broadcast's
  number; another number, 0 or empty: found by the password alone) and `pwd` (the broadcast's MeOS password, `mop`: 16 letters,
  made at creation or by « Nouveau mot de passe », POST `{ op: "mopkey", id }`; GET gives it to the opener and administrators only).
  Answers `<MOPStatus status="OK|BADCMP|BADPWD|NODATA|NOZIP|BADXML|ERROR">`. The body goes unread to the race's object (`/mop`),
  which reads it (`live/src/mop.js`: a small XML reader, the zip's first file by DecompressionStream), keeps MeOS's state —
  head `mop:h` (competition, controls, classes with their radio controls per leg, clubs, each runner's and team's class), each
  class's runners and teams under `mop:c:<id>`; card numbers not kept — and passes the classes touched, in the compact form, to the
  same `update` as the page's push (`prune`: classes MeOS no longer has go). MeOS status codes → liveresultat's (1 OK, 3 PM, 4
  DNF, 5 DSQ, 6 OT, 20/21 DNS, 2/15/99 NC; 0 = out when `competing` or a punch, else the start time decides); `prel="true"` (a
  radio finish before the card is read) is the row's 10th field, « provisoire » on « En direct ». Split times: the class's
  `radio` list (the controls ticked in the service); with « Envoyer tous les poinçons après lecture de la puce » it is the whole
  course and every split comes at the card's readout. The relay's ticker holds radio punches too (each at start + time), a
  runner seen for the first time being no news (the first send spans several pushes). The page's card « 2. Depuis MeOS »: the
  address, number and password with copy buttons, MeOS's last message (`mopAt`, `mopRunners`, from the directory's `touch` with
  `via: "mop"`). Tested locally with a simulated MeOS (scratch `mop_test.mjs`: chunks, zip, prel → readout, MP, deletion, a
  renamed class, a relay team, wrong password and number).
  **« En direct » estimates** (2026-10-22): a runner still out shows « arr. ≈ hh:mm » — start + their time at the last radio
  control ÷ the finishers' median there × the finishers' median time (the median time without a punch; 3 finishers at least;
  `live.js` `usualOf`, `eta`).
  **A broadcast published in « Résultats »** (owner, 2026-10-23: Ozimut's own answer to MeOSDjango's results sites, the
  dependency gone — a club sending MeOS to Ozimut keeps its results, splits and start list after the race; no public page,
  every account sees them, the CN columns for France's members as elsewhere): a broadcast is tied to a competition — at its
  creation (« Compétition »: the club's of France's agenda from yesterday to a week ahead, an administrator's all, or one
  declared outside France) or later (POST `{ op: "link", id, race }`, null unties) — by its organisers only
  (`api/live/broadcasts.js` `raceFor`: `_lib/club.js` `findRace` + `organises`, 403 « not organiser »); the directory keeps
  `race` and the competition's name, day and organiser. `mop.js` and `push.js` pass it to the race's object (`X-Race`), which
  saves the broadcast to R2 (relay binding `BUCKET` → `cn-state`, `live/wrangler.toml`) as `broadcasts/<number>.json` — the
  competition's key, its info, every class in the compact form — by its alarm, `SNAP_MS` (2 min) after a change (a pushed
  race's alarm serves nothing else), and at once on « Publier maintenant » (POST `{ op: "publish", id }`: the object's
  `/snapshot`, then a `prov` run by `upload.startRun`) or a relink. The workflow copies `broadcasts/` to
  `$CN_DATA_DIR/broadcasts`; `ffco_scraper/prov/sources/broadcast.py` makes each a document of its competition, source
  « direct » (`SOURCE_RANK` 5, as the organiser's site; « Diffusion en direct de l'organisateur » on the race page): its
  results once someone has finished (url `direct:<number>`; the runners still out counted in `live`, so the race shows « en
  cours » and the « mise en ligne » alert waits; with nobody out it counts as the organiser's final file), before that its
  start list (`direct:<number>/start`, kind « startlist »: the agenda's box, the start-time alerts; an organiser's deposit
  under « Horaires » wins); split times only for a class of 4 controls or more (MeOS's « all punches », or an export with
  them). An untied or retied broadcast takes its documents away from the former competition; a competition not yet in
  `prov_races` is tried at the next run. Tested locally end to end (scratch `e2e.mjs`: creation with a race, MeOS entries →
  start list, finishes → results with one runner out, publish, untie, relink, the page's own push, the alarm's save; the source
  and `run.build` on a test database) — not yet with a real MeOS.
  **MeOSDjango races** (2026-10-23, owner: the Pélussin City Race was live there and not on « En direct »): the relay lists the
  races of the MeOSDjango sites (`live/src/meosdjango.js`, `HOSTS` — append only: a race's number is 800 000 000 + the site's
  place × 1 000 000 + its competition number) of the last 3 and next 7 days beside liveresultat's, today's probed for their last
  punch (a few courses a call, `MD_LIST` requests at most; `MAX_INFO` lowered to 25 for the subrequest limit), the site's
  address named in the list. The race's object reads every course's JSON while someone watches (20 s while punches come, 60 s
  quiet, 5 min once the site says « finished »), one class per `class_name`, MeOS's « FAMILY, Given » turned round, and passes
  them to `update` as a broadcast's push. In `update`, a card read at the finish (the finish and over two splits new at once:
  MeOSDjango, MeOS's « all punches ») puts its finish on the punches' line, not every control; many splits new at once for a
  runner already through (a card read later, a mispunch) put nothing there.
  **O'Live races** (2026-10-24, owner: the CF Sprint, cancelled, replaced by « Sprint Labyrinthe - Le Bessat », live on
  co-live.fr): the relay lists O'Live's individual races (`live/src/olive.js`, `HOSTS` append only, numbers 700 000 000 + the
  site's place × 1 000 000 + its IdCourse; its address where the organiser goes: O'Live gives none), today's probed two circuits a
  call (`OL_LIST` requests; `MAX_INFO` lowered to 21), a race live while someone was seen « Run. » under `LIVE_S` ago — with a running time that moved since that page's last probe (`outSig`, `relayOutSig`, hashed in the probe's `sig`: a runner never cleared keeps a frozen « Run. » once O'Live stops importing; 2026-10-25). HTML only,
  no API: the race's object reads every circuit's results page (`OL_MAX` 24, the others in turn) — one class per category, a
  category on several circuits one per circuit —, then the cards (bloc.php `PointagesPuce`: each punch's time of day, so the
  exact start) of the runners through since, those just finished first (`OL_CARDS` 15 a wake-up), or for a backlog (a race
  joined under way) the circuit's split times page at once (`OL_BULK`; a page O'Live fails to make — A1 at Le Bessat, a PHP
  error — is not asked again). A runner out has a start estimated from their running time, which O'Live counts at its last
  import (frozen up to a minute): their start while waiting (« 12 h 46 »; « 00 h 00 » none) or their card's replaces it. « Arr »
  (finished, card unread) is a provisional result, « Arr? » not classified. 20 s while runners are out or cards wait, 60 s with
  only starts to come, 5 min after. The Agenda maps both ranges to « host/<n> » (`keyOfComp`, `run.LIVE_IDS`).
  **O'Live relays** (2026-10-25, owner: the CNE at Le Bessat; listed since, `isRelay` by the list's type « Course en Relais »;
  « Résultats » still leaves relays out): `readOlRelay` reads each category's page (« Ant », a leg sent off by the mass start, stays on the leg and its team once through: out only while it has no handover total, or, a team missing a leg, while its block is not « Arrive » — 2026-10-25, the CNE showed « live » all evening; `?Action=Result&IdCat=`, `relayCats`; up to
  ~470 KB, ~30 ms to read all six), a category with nobody out or to start again every 5 min only; `relay()` reads each team
  (place, bib, name, time so far, state, its place after each leg) and each leg (runner, leg time, place, state, the team's total at
  the handover); the legs sorted by their own numbers: O'Live's page does not always list them in order — « Cobs Dames »
  1, 2, 4, 5, 3 with its 3rd runner absent). `compactRelay`: one class per category, a row per leg's runner — leg place, leg time and gap to the leg's best,
  the leg's start, and a 11th field [team bib, leg, team total, team place, gap to the first team there] — and the class's `relay`
  { legs, teams: [[bib, name, place, total, status, gap, legs done]] }, which `update` keeps and compares (counts by team). No
  cards read: a leg's start is its team's start (the earliest seen from a runner out, now less their running time; `m.ol.t0`)
  plus the team's total before it, or what is seen when over 2 min apart (a mass start). « En direct » (`live.js` `relayTable`;
  owner, 2026-10-25): each team one line, a button (`.lv-tbtn`, kept to the visible width: its rank — at the finish, else after
  the last team in, in race order —, its name, its total at its last handover, ticking before the first) that opens its runners
  (`st.openTeams`, kept over the updates; a runner searched for, or picked in the club views, opens their team, marked and
  centred); racing teams grouped by the leg being run (« Relais 6/7 », the furthest first, then by the team's total — not a
  leg's own: a mass-started leg's total is lower); a team with a runner PM, abandoned, disqualified… is not ranked
  (« Non classées », at the bottom, under that runner's state). A runner: leg number, runner, start, leg time with its place and
  gap, the team's total and gap to the team O'Live ranks first there, « Rang » (the team's place when that runner came in),
  category (from the data), CN. Every redraw keeps the row tapped, else the row marked, else the first row in sight, where it was
  on the screen (`anchor` / `restore`; `overflow-anchor: none`: updates and taps scrolled the page). A runner's line opens their times at the
  radio controls (owner, 2026-10-25: as O'Live does; no link to the runner's page there): control, split, time from their start,
  place and time behind the first there, the finish last — O'Live's card readout (bloc.php `PointagesPuce`, `ol.punchList`), read
  by the relay when a page asks (`{ punch: { c, k } }` over the WebSocket → `{ t: "punch", rows }`; kept 20 s, one read a socket a
  second), by the leg's card number the category's page gives (`relay()` `card`), kept by the relay under `olc:<category>` and
  never sent to the pages; a runner out has a card once a radio control saw them. No score or
  expected place; the punches say « Fin du relais n » before the last leg (`legEnd`). Club views and the search use the rows.
  In the club views a runner PM, disqualified or over time counts as arrived (`ARRIVED`: listed after the classified of their
  course, their state in the time column; owner, 2026-10-25) A name in the club views opens the runner's
  circuit (a relay's: their team) with their line marked and scrolled to (owner, 2026-10-26; the runner's page no longer). A name in
  a circuit's table opens a window over the page (`openPop`, a `<dialog>`) about the runner, not what the table already says
  (owner, 2026-10-26): for the method chosen in the header only, one block per discipline the runner has a value in or raced in
  over 3 years, the race's own first (`TERRAINS`, `factsOf`): the value today, the place overall and in the category
  (`loadRanking` at the latest month), races and PM rate over 12 months, podiums and wins over 3 years; then their times at
  the radio controls; ✕, « Fermer », Échap or a tap beside it close it; « Sa page complète » opens the runner's page in a new tab,
  not offered in the app installed on a phone
  (the page left « En direct » with no way back in the installed app). **The official CN J-15** (owner, 2026-10-26: a runner's CN
  in « En direct » was their CN after their race of late August, their page showed today's, FFCO's J-15 lay between): the official history is FFCO's CN after each race **and the CN J-15
  FFCO printed for each race, dated 15 days before** (`build_site` `off_events`: FFCO's CN also moves between races, a race leaving
  its window, which only the next race's CN J-15 tells), and the build writes `snap/official_j15.json` (the official CN on the
  build day − 15, per discipline), which « En direct » uses when the race's J-15 is within 3 days of it, else the month-end before.
  **The official CN computed by day** (owner, 2026-10-26): in forest and sprint, while a runner's 12 months hold 2026 races only,
  the snapshots and that file compute the official CN from FFCO's race points (`build_site.off_value`, `cn.ffco_cn`; `cn.js`
  `trimmed` alike): the best 10 % and the worst 40 % dropped (rounded half away from zero), the mean of the rest **without its
  zeros**, 2 races for the CN FFCO publishes (its CN page: « Pas de CN : pas assez de course » with one; the snapshots), 1 for
  the CN J-15 it prints to value circuits (`official_j15.json`) — a race leaving the window then shows on its day, as in the
  Ozimut index; a window of zeros only has no CN (FFCO's page alike; the published values had kept the last one). FFCO prints a
  « nouveau CN » after a race when the window holds 2 races or more (3 616 of 3 624), never with one (1 200 of 1 200). FFCO
  trims the window again every day, but **a window a race leaving it brings down to one race keeps a CN — that race's points —
  only if the race counted in the CN computed after it** (not among the worst 40 % dropped then; `build_site.counted`: the CN
  FFCO printed after it is not above its points, else ranked against that window's races, the 2025 ones on their old scale).
  Found by reading FFCO's CN page at 30/09/2026 for every runner whose window held one 2026 race (owner, 2026-10-26: 1 037
  pages, 148 with a CN): this rule 995 exact, « 2 races or none » 86 %, the published values 802; windows of 2 races or more
  that lost a race since their last (150 pages): the daily trim 135 exact, the published values 14. The misses: races FFCO
  processed after the earlier race had left (a race of 20/09 with a 2025 race leaving on 22-28/09), its re-evaluated 2025
  points, races the database lacked. Measured against what FFCO
  prints (the 2026-09 database, 2026-only windows): the CN after a race 2 005 / 2 008 in forest, 387 / 387 in sprint; the CN J-15
  — the CN at the end of the race's day − 15, races of that day included — 1 067 / 1 068 and 100 / 100 (the misses: a race whose
  points FFCO changed). A window still holding a 2025 race keeps FFCO's published values: FFCO re-evaluated last season's races on
  its 2026 scale under new circuit ids, whose points only each runner's CN page gives (the old points match 9 %). VTT and ski
  keep the published values (no 2026 race in the database measured). Each build prints the match (« official CN computed
  against FFCO's »).
  **SPORTident Center events** (2026-10-24, owner): the relay lists the Center's public orienteering events of the last 3 and
  next 7 days, every country (`live/src/sportident.js`, numbers 600 000 000 + the event's id; its country from the event), today's
  probed by a HEAD of the results file (`SI_LIST` requests a call; `MAX_INFO` lowered to 17), the age being the time since the
  file last changed. The race's object asks the directory for the event's file (`/si?id=`), then reads it again with its ETag
  (a 304 costs nothing): 20 s while it changed in the last 5 min, 60 s with runners out or to start, 5 min after; one class per
  SPORTident class, splits and places at every control, « finished » not yet evaluated shown provisional; the event's time zone
  passed to `update` (`info.timezone`, otherwise Europe/Paris). The Agenda maps 600 000 000-699 999 999 too.
- **IA** (`#/ia`, `pages/ask.js`, menu « Classement » after Statistiques; owner, 2026-10-15; administrators only the first
  day, **every account since 2026-10-16** — 15 questions a day per account on the free model, administrators apart, `PER_DAY`
  in `api/ask.js`; the other Workers AI models of the menu are the administrators' tests): a question in plain French answered with a table, a chart or a few figures. A language model on **Workers AI**
  (`functions/api/ask.js`, binding `AI` in `wrangler.toml`; the account's free allowance, 10 000 neurons a day shared by the
  whole account — past it the calls fail until the next day, nothing billed on the free plan) turns the question into ONE
  DuckDB query and says how to show it (`functions/_lib/ask.js`: `TABLES`, the tables described for the model — keep them in
  step with `site_ask.py` —, `systemPrompt` with its rules and one worked example, `parseAnswer` tolerant of the models' JSON
  slips). The browser runs the query with **DuckDB-WASM** (1.32.0, vendored: the « eh » engine only, in two parts the page joins) on `site/data/ask/*.parquet`, loading only
  the tables the query names (`cn` 2.7 MB and `runners` 0.4 MB for most questions; `results` 8.8 MB): **the model never sees
  the data**, only the question, the tables' description, the asker's licence, today's date and the site's method and
  discipline. `checkSql` lets only one read run (no other statement, no file, no address); a query that fails goes back
  to the model once with its error. « Préciser cette réponse » sends the previous question and query with the next one.
  Model: `@cf/openai/gpt-oss-120b` at low reasoning effort (tested 2026-10-15 on 20 questions, scratch `ask_eval.py`: 19/20
  ran, about 105 neurons and 10-20 s a question, so roughly 90 questions a day for the whole site); Qwen3-30B was cheaper
  (57) but ignored the rules, and DeepSeek V4, Kimi and GLM 5.3 are not on the free plan. The models' mistakes found and
  answered in the prompt: columns that do not exist (cn has no category or season), disciplines mixed in one value,
  percentiles computed within the club instead of over France. 40 questions an hour per account (200 for administrators).
  The tables carry what the site publishes (anonymised runners included; the official CN and the CN Top only, not the
  analysis methods); nothing is stored; the privacy page's « Questions à l'IA » says where the questions go.
  **Own API key** (owner, 2026-10-15): « Votre propre clé d'API » lets a user pick OpenRouter, Anthropic, OpenAI or Google and a
  model, with their key (`site/assets/js/askbyok.js`: each provider's model list — OpenRouter's is public, 463 models on
  2026-10-15 with 18 free, loaded as soon as it is the provider; the newest of the preferred family suggested — and its call;
  errors in plain French). The models are a menu (owner, 2026-10-16: a text field with a suggestion list showed one model
  only, the browsers suggesting what contains the field's text): OpenRouter's free ones first, then one group per maker,
  newest first, with the price per million tokens; a filter above it, which keeps the user's pick. The browser
  calls the provider itself (all four accept it: checked with a dummy key, each answers a readable refusal); O'CN's server
  only gives the instructions (`/api/ask` with `promptOnly`: the messages, no model call, no quota), so the key never reaches
  O'CN. Kept in `sessionStorage ocn.ia.byok`, or `localStorage` with « Se souvenir », dropped by « Oublier la clé » and at logout
  (`auth.logout`); requests to the providers omit cookies and the referrer. The answer is read by `askparse.js`, shared with the
  server. The privacy page says where the questions go (« Questions à l'IA »). Tested with each provider's replies simulated
  (request shape, parsing, cost from OpenRouter's `usage.cost`); a real key is to be tried by its owner.
- **Category percentile and PM rate** (owner, 2026-10-15): `ranking.loadRanking` gives each row `pct[m]`, its percentile in
  its category over all of France at that month (percent_rank: the share of the category's ranked runners with a lower CN;
  100 = the best; `data.fmtPct` shows whole numbers), before any filter; « Classement » shows it as « Centile cat. » and the
  club page's « Membres » too, both sortable. The PM rate (`data.pmRate`: the share of « pm » among a runner's races of the
  discipline in the 12 months to the latest data) is the members' « PM 12 mois » column (since 2026-10-23 from the club's own
  file, `pm` {licence: {terrain: [n, pm]}} by `site_extras.member_pm` — it read every member's race file, up to a hundred
  requests a club; a member the file does not list still from their race file — filled in place) and the runner page's « PM sur 12 mois » tile (beside « Courses sur 12 mois »).
- **Catégories** (`#/categories`, `pages/categories.js`, menu « Classement » after « Classement »; owner, 2026-10-18, after a
  mockup on real data): at a month-end (`?date=`), for the site's method and discipline, each class's CN spread on one axis —
  a band from the 10th to the 90th percentile, the middle half darker, the median (white tick) and the mean (◆) —, women and
  men side by side per age (`?sexe=` D or H for one), the axis from a round value under the lowest band; the D21 and H21
  medians as dashed lines (`?ref=0` hides them). **The best of each class** (owner, 2026-10-18, second rule; one rule everywhere,
  written under the chart, `cg.rule`): in each class of at least 5 ranked runners (`MIN_SHOWN`), its best 2 % rounded down
  (`TOP_SHARE`) and at least its first, equal CNs at the cut all in — forest Top 62 runners (1 to 5 a class), sprint 31, VTT 25.
  The first rule (above Q3 + 1.5 × IQR, top 5 %, 20 runners or more) followed each class's spread: a D65 leader at 1.84 × her
  median was out while an H55 third at 1.63 × was in, D18 and women's veteran classes had nobody. Classes of 5-19 drawn pale
  (less certain percentiles). They are dots (a click opens the runner) and a table, by class then rank by default: CN, class
  rank (« 1er sur 76 »), × the class median, percentile in D21 / H21 (the share of that class below their CN).
  runner is ringed on their class's row; « Mon club » (`?club=1`) rings the club's runners. All computed in the browser from
  `loadRanking` (the monthly snapshots); the Documentation's « Les calculs du site › Coureurs » explains it.
- **The organisers' page of one analysis** (`#/orga-analyses?id=`, `shared.js` `managePage`; owner, 2026-11-04: « this is not a page to do
  analyses, this is a page to manage the publishing and setting, and ultimately removal, of the analysis »): no replay (that is the
  runners' page, « Voir comme les coureurs » in a new tab, where the organisers still draw exercises and share route choices). The
  circuits listed (controls, km as the crow flies from the georeference, `courseLength`; traces and solo counts) with the map of the
  one chosen beside them, its course drawn; « Publication et accès » (title, date, access, password, visitors); « Ce que les coureurs
  peuvent faire » (switches saved at once); « Fréquentation »; deletion. The circuit editor and the OCAD import take the page's width
  while open (`editing`). **Drafts**: every analysis created since then is `draft` until « Publier » (a circuit at least): its
  organisers alone list and open it (API 403 `draft`, out of the visitors' list); « Repasser en brouillon » hides it again, the traces
  kept; analyses of before have no `draft` and stay published. **Switches** (`meta.opts`, `api/analyses` `OPTS`/`optsOf`, defaults):
  `upload` (on; off: PUT trace refused, 403 `closed`, to all but the organisers; the traces shared stay and can be removed), `solo`
  (on; off: « Analyse solo » on the organiser's map refused, `an.orga.closed`, and the analysis left out of tile 2's picker — summary
  `solo` "0"), `mymaps` (on: « Enregistrer dans Mes cartes » in Solo's orga mode and, new, in the multi replay for one's own trace,
  `trace/mymapsave.js` with the map as stored), `notes` (on; off: comments neither shown nor written, PATCH note 403), `variants` (on:
  the « Variantes » tab and colouring), `view3d` (on), `video` (on), `routes` (on since the same evening — the computed routes, every
  account's, below; administrators always; `rv` marks a record whose `routes` was saved after that change, the older `routes: false`
  being the old default and ignored). The server enforces upload, notes and drafts; the others are the pages'. **Counts** (`GET …/stats`, organisers only, numbers
  only): R2 `analyses/<id>/view-<uid>.json` (an account's GET of the analysis, not an organiser's nor Solo's `?for=solo`; first/last
  day and days in custom metadata, written once a day), `solo-<n>-<uid>.json` (`POST …/solo/<n>`, sent once a visit by Solo's orga mode
  when the playback starts), `gview-<day>.json` (visitors without an account, a count); traces' custom metadata `note: "1"` from then
  on (comments counted from 2026-11-04). An administrator's test traces are counted apart (« +N de test », a « Tests » column), never
  as runners. **Who opened it** (owner, 2026-11-04: « I need a way for an admin to see which organisers own and opened which map
  analyses »): Orga's list has « Ouverte par » (the account's name, the day, the way in) and « Seulement les analyses ouvertes », the
  analysis's page « Ouverte par … le … »; the administrators also see the account's e-mail (`withEmails`, one D1 query). `created` and
  `via` (« list » Orga's button, « form » a new training, « tracer » the Tracer's publication; recorded since 2026-11-04) are in each
  analysis's summary (an older summary is written again once at the first list). Removed with the analysis, the circuit and the account (`api/account/delete.js`); the privacy
  page says so.
- **« Analyse multi » is no longer said** (owner, 2026-11-04), in any language: what an organiser opens for an event and the
  runners add their trace to is its « analyse de carte » (map analysis, Kartenanalyse, análisis de mapa; Orga's page « Analyses de
  carte », « Ouvrir l'analyse de carte »); the runners' side, where it is told apart from « Analyse solo », is Coach's tile
  « Comparer avec les autres coureurs » (`ma.multi.title`). Code names (`multi`, `shared.js`, `beta.multi`) keep the old word.
- **« Analyse », simply** (owner, 2026-11-05): Coach's « Analyse de carte » and Arena's « Analyse de course » are both « Analyse » (Analysis, Analyse, Análisis), Orga's « Analyses de carte » « Analyses », and in running text « l'analyse » — so the notes above saying « Analyse de carte » / « Analyse de course » mean these pages; a text that must say whose writes « Arena › Analyse » / « Coach › Analyse ». The Tracer's ribbon button is « Publier l'analyse »; the event page's left-panel tab « Analyses » is « Temps » (`sh.tab.views`). Routes and code names (`#/analyse-carte`, `mapAnalysis`, `nav.raceAnalysis`) unchanged.
- **Vocabulary** (owner, 2026-10-14, as the World Ranking separates them; renamed 2026-10-19): a race's points are the
  « score Ozimut » / « score officiel » (`ui.scoreLabel`, i18n `score.*`; « score Top » until 2026-10-19), a runner's ranking
  value the « indice Ozimut » / « CN officiel » (`ui.cnLabel`, `ui.cnWords`, `cn.*`; « CN Top » until 2026-10-19); the
  header's switch is « Classement : Officiel | Ozimut »; the Top's circuits are valued on the runners' « niveau habituel », which regular users never meet as a method —
  for analysts it is the « CN Fit » (it shares the Top's scores; the linear pair has its own « score linéaire »); the
  documentation never says « Fit ». The results
  tables' headers, the runner page's tiles and cards (`rn.current`, `rn.best`, `rn.calc`, `rn.cnHistory` take `{cn}`), the
  switch's tooltips and the documentation use these words.
- **Documentation** (`#/documentation` since 2026-10-24, `#/methodes` before and still opened, rewritten; `pages/methods.js`, title
  « Documentation », `page.methods`). **Since 2026-10-31 a home and one documentation per module** (« The four modules » above);
  what follows is the layout of 2026-10-24 to 30, whose texts it regrouped. **Since 2026-10-24 (owner: the page told the methods, not the site)** its tabs are « Le site »
  (the menus, country and language, account and alerts, the phone), « Courses » (Agenda, Résultats — the provisional scores —,
  En direct, Analyse de course — the split times' calculations —, the GPS analyses), « CN officiel » (France), « Méthode
  Ozimut », « Coureurs et clubs » (the former « Les calculs du site » less the split times, France only), « Entraînement »
  (Jeux, VMA, Analyse solo, Analyse multi), « Organisation » (who organises, Résultats, Horaires, Direct, GPS tracking, the
  multi analyses, declared competitions, the course setting) and « Le tracé »; the guide's four are `content/guide.fr.js` /
  `.en.js` (`build(X)`, the same chapters in step). « L'étude » has a panel but no button: the Ozimut method's tab leads to
  it (a notice after its lead) and it leads back; `?onglet=etude` still opens it; `?onglet=calculs&voir=resultats` opens
  « Courses › Analyse de course ». A country without a ranking of its own (Switzerland…) shows France's figures under a note
  (`data.countryJson`, `doc.country.none`). Before 2026-10-24, four tabs — « CN officiel » and « CN Top », each
  method's rules and formulas, facts only; « L'étude », the white paper in ten chapters (objectives, the point of departure,
  the measure, the base choices, the score and its mean, the circuit's value, the recalage, the results, the alternatives
  discarded, the conclusion) with the figures that support each decision, drawn as SVG from `site/assets/study.json` (the
  study of 2026-10-13's aggregate numbers, built by the scratch `study_json.py` from the evaluations under
  `C:\kerkia\Ozimut\work\study`; public, nothing personal) and from the live `evaluation.json`; « Les calculs du site » (clubs,
  coureurs, réseau, résultats et temps intermédiaires, relais, limites). Chapters are a second row of tabs (`?voir=`); the old
  tab names (`essentiel`, `detail`, `analyses`, `autres`) still open the right tab. The page's texts are in the module (French), written for orienteers who are not mathematicians (owner, 2026-10-14): plain sentences, both sides of every comparison, each term explained with numbers, one worked circuit of six runners (`RACE6`, F got lost) used on every tab, the dated exploratory tables folded away (`more`).
  The PDF white paper (`site/assets/ozimut-methode.pdf` / `.en.pdf`, « La méthode Ozimut », public, linked from the study;
  `build.py` also writes copies under the former names `ocn-methode-top*.pdf` for old links) is LaTeX: `docs/whitepaper/`
  (`methode-ozimut.tex`, `figures.py` → `fig/*.pdf` and `tables.tex` from `study.json` and the study's evaluations,
  `build.py` runs it all with MiKTeX — per-user install, `winget install MiKTeX.MiKTeX --scope user`, packages fetched on the
  fly). Rebuild and commit the PDF when the study's numbers or texts change; the deploy serves it as any asset.
- **Every page for every account** (owner, 2026-10-15): « Entrainement » (Jeux, VMA, the analyses), « En direct », the
  analyses under « Courses » and « Organisation » (« Tracer » included, confirmed by the owner the same evening: what an
  event shows still depends on its team, not on the account's rights) were for the administrators (or the `users.live` right) until then;
  the gates are gone from `app.js` (the right stays in D1, unused). The admin page alone stays the administrators'.
- **Organisation** (menu group `orga`, the control flag's orange; owner, 2026-10-15): the organisers' pages —
  « Analyses de carte » (`#/orga-analyses`, route `orgAnalyses`, `pages/shared.js` `orgListPage`; owner, 2026-11-04: the former
  « Compétitions » and « Entraînements » as one list — `#/orga-competitions` and
  `#/orga-entrainements` still open it): the competitions of the last 60 days organised by one's club (one analysis each,
  « Ouvrir l'analyse de carte » then its circuits), the competition analyses older than that, and one's training events
  (« Nouvel entraînement »); **four tabs** (owner, 2026-11-04: its four jobs; `orgListPage`, `?onglet=`): « Analyses ouvertes » (the default: the opened ones, competitions and trainings, a row chosen then « Gérer l'analyse »; double click or Enter too), « Ouvrir une compétition » (the club's competitions without an analysis and those the account created, a row then « Ouvrir l'analyse de carte »), « Nouvelle compétition » (the competitions card of `declare.js` as its form alone, `formOnly` — worded « créer » since that day, not « déclarer »: France's come from the federation —; once created, the competition is chosen in « Ouvrir une compétition ») and « Nouvel entraînement » (the form); the lists sort as the Agenda's, several keys with Shift (`picker`'s `cols`); an account sees the analyses it opened itself, an administrator every organiser's (a competition a club-mate opened is not offered again); an analysis opens at `#/orga-analyses?id=` whatever
  its kind (read with it). An analysis's settings show the new password only for « mot de passe » and « Ouverte aussi aux visiteurs
  sans compte » only for « tous » (owner, 2026-11-04). **The circuits come in by one drop zone** (owner, 2026-11-04: « Ajouter un
  circuit » and « Importer un fichier OCAD » were two buttons to one place; `setup`'s `#sh-drop`, no « Circuits » heading until there
  is one): an OCAD/Mapper file among the files dropped is read in the circuits card, anything else opens the circuit editor with
  those files (`ctx.files`, the page hidden while it is open, `ctx.done` gives it back). **The OCAD import happens in the card**
  (owner, 2026-11-11: « this should all happen in one page » — it was a panel replacing the page, its own drop zone, list and
  « Créer les circuits », then the page again): `managePage`'s `take` reads the files dropped (`imp`, the state kept so the card
  can be drawn again), the courses found are listed under the circuits (ticked, « remplace » on a name already there, the results'
  circuit picked for a competition), the first shown at once on the map card as it will be published (`showPending`, `renderOf`:
  `circuitOf` at 150 dpi, kept for the adding; a click on another row shows it), a missing background map or a blank render said
  there before anything is sent, a file missing dropped on the same zone (« Il manque un fichier ? »); one consent box and
  « Ajouter les N circuits » (`addImport`, progress in the card), then the card shows them as circuits, the first chosen. The
  circuits card is the left column's first, above « Publication et accès ». A file dropped on the circuit editor is handed over
  (`ctx.ocad`). **The OCAD import** (`shared.js` `take` / `addImport`,
  `tracer/circuits.js` `readCourseFiles`): an OCAD course-setting project —
  the courses file (its `courseSetting`) and the background map it names as its first OCAD/Mapper template (« …P.ocd » over
  « …F.ocd », same OCAD coordinates, as the Tracer's `ocadCourses`), dropped together or one after the other (the panel asks for the
  map by name) — each course ticked a circuit: its map printed with the course at 150 dpi, controls and georeference (the map's
  grid, else the courses file's) by the Tracer's engine (`circuitOf`, shared with the Tracer's « Publier vers l'analyse de
  carte »); a circuit of the same name replaced, its variants and exercises kept; an .ocd/.omap/.xmap dropped on the circuit
  editor opens it, and a file the editor refuses says so in its panel (it was silent). Checked on the Desquinemarre project of
  2026-11-08 (5 courses, Lambert 93). « Résultats » (`#/orga-resultats`, `pages/orgresults.js`:
  the club's races with what « Résultats » shows of them, « Déposer les résultats » = `#/deposer?course=…&orga=1`), and
  « Direct » and « Tracer » (below). **An organiser** is a member of the
  race's organising club — the club of the account's latest race in the site's data against the race's `org` number
  (`functions/_lib/club.js`: `clubOf`, `orgCode`, `raceOf`) — or an administrator; any account may create a training
  event. A competition's analysis is created by its organisers only, once (a second ask returns the first, `existing`),
  and every member of the organising club manages it (`meta.orgClub`, `isOrganiser`). An organiser's results deposit
  (`X-Upload` `organiser: true`, checked the same way, 403 « not organiser » otherwise) is noted « déposé par
  l'organisateur », and its race is no longer looked for on the club's site or the platforms (`prov_meta` `org_races`,
  kept by `sources/upload.apply`, skipped in `run.run`'s loop): the organiser's file is used as it is.
- **Orga › Gérer** (`#/gerer`, route `orgManage`, `pages/manage.js`; owner, 2026-11-11, after the plan of the same day, private
  artifact https://claude.ai/artifact/3sUsQZWk8AToxEQvvrXyR2): Orga's menu is three verbs, Gérer · Tracer · Cartographier; the pages
  « Analyses », « Résultats », « Horaires » and « Direct » are an event's tabs (their addresses lead there: `app.route_`,
  `#/orga-horaires?course=X` → the event holding X on « Départs », else the creation with X chosen; `#/orga-analyses?id=` still opens
  an analysis's own page). **An event** (D1 **migration 0026**: `events`, `event_members`, `event_requests`) is one race or one
  training (owner: « one event, one race », as FFCO), its type `individual` | `score` | `relay` | `training` deciding its tabs
  (`TABS`: Départs — the booking and the start list —, Direct — and the GPS link —, Résultats, Analyse, Équipe; a relay Direct,
  Analyse, Équipe — « Résultats » leaves relays out, see the plan's relay proposal —; a training Analyse, Équipe). No « Aperçu » tab
  and no « Réglages »: the list of events is the way in (Arena's look: periods, months, today's line, each row's tabs as chips with
  their state, a chip opening that tab, the row the tab fitting its day), « ✎ Modifier » the description, the calendar link and
  deletion. **The team** (owner): every member has the same rights (everything, the team and deletion included); nobody is added —
  people ask (« Rejoindre une équipe », `GET /api/events/find`, or the event's own address), any member accepts (a push to the
  members, one to the asker: `templates.eventPush`); one leaves, the last member deletes instead. **Linking to the calendar** (France):
  a competition of the agenda (`a<id>`) or of « Résultats » (its key: an organiser may come after the race, the agenda having dropped
  it; `CAL`), at most one event each (unique `race_key`); a member of the organising club (`clubOf`) is linked at once (« verified »),
  anyone else waits for an administrator (« pending »: `race_key` NULL, the tools closed; admin page tab « Événements »: confirm or
  refuse). An unlinked competition keeps a key of its own `d<id>`, written to R2 `declared/<id>.json` as the declared competitions
  were (`events.mirror`; France's too now, `sources/declared.py`, relays not: `races.py` drops them); it may be linked later only while
  nothing was deposited under that key. **Who acts as organiser** (`_lib/events.js canManage`, the body of `club.organises`, which
  uploads, booking, broadcasts, tracking, analyses and the Tracer call): an administrator; else the team of the event holding the
  competition (`eventOf`: its key, or the agenda id a race of « Résultats » carries); else nobody with `EVENTS_STRICT` "1"
  (wrangler.toml), the rule of before (a member of the organising club) with "0" or before the migration. A live broadcast tied to a
  competition is its team's too (`api/live/broadcasts.js`, `push.js`: `teamIndex`); a map analysis held by an event (its competition,
  or `events.analysis` for a training) is its team's alone (`analyses isOrganiser`). **Claimed competitions**: a runner's results file
  for a competition held by a linked event is refused (`upload.js`, 403 `claimed`); unclaimed ones still take them. Results deposits
  for a race of the agenda that « Résultats » lists (`a<id>`) were all refused before 2026-11-11 (`!race.declared && !raceOf`).
  `POST /api/events/migrate` (admin page › Événements › « Créer les événements »; idempotent) made the events of what organisers had
  done (organiser deposits, bookings, broadcasts tied to a race, competitions' analyses, declared competitions with their ids kept,
  trainings' analyses as training events), the earliest account the creator. The tools draw in a tab through an embedded mode
  (`orgstarts.deposit(…, { base })`, `bookingorg.renderBooking(…, { base })`, `deposit.render({ embedded })`, `orgdirect.render({ event })`,
  `shared.js` `managePage(…, embed)` by `?embed=1`); `app.replaceQuery` keeps `ev`. Texts: area `i18n/manage.*.js`. Local test: launch
  configs `pages-dev-gerer-user` (8784) / `pages-dev-gerer-admin` (8785), on a copy of `.wrangler/state` (another session's dev server
  on the shared state made pages hang); a second local account in `.dev.vars`' comments.
- **Organisation › Horaires** (`#/orga-horaires`, route `orgStarts`, `pages/orgstarts.js`; owner, 2026-10-18): an organiser deposits
  the start list of a coming competition of their club (the agenda's competitions of today to +90 days, relays apart; administrators
  see all). Files: IOF XML StartList (best), CSV (a header row then a runner a row — Heure/Départ, Nom, Prénom or a whole name,
  Club, Catégorie, Circuit, in any order and with « ; », « , » or tabs —, or a grid: a circuit per column pair), HTML, OE/MeOS PDF,
  or a Google Sheets link shared to anyone with the link (`functions/api/sheet.js` fetches its CSV export: the browser cannot;
  60 a day an account). **Read in the browser** (`localstart.js`, pdf.js for PDFs, words of a run placed by Arial widths) as the
  server reads it (`parsers/startlist.py`: `_csv`, `_read_table`, `_grid`) — keep them in step; checked on 20 real files, 19
  identical —, shown with warnings (a name twice, unknown circuit, another date, registrations vs runners), then sent as upload
  kind « startlist » (`api/upload.js`: organisers only, until the race's day, an agenda race `a<id>` allowed; GET `?race=&kind=
  startlist` lists the race's deposits, DELETE `{id}` removes one, both organisers only; a `prov` run started at once).
  `sources/upload.py` reads it into a « startlist » document (the race's latest deposit by any organiser supersedes) and lists the
  race in `prov_meta` `org_starts`: liveresultat and the club's site are no longer read for its start list, and `run.build`
  publishes the organiser's alone, up to `ORG_START_DAYS` (90) ahead. The runners get their start time by push (below); by
  e-mail later (owner: the Resend plan is too small). **Draw checks and O Checklist** (2026-10-22, ideas of MeOSDjango's checker and
  « Vérifie moi » export, none of its GPL code): `startchecks.js` `check` warns of two runners of a club one after the other on a
  circuit (a category in a list by category), a start minute shared, runners without a
  start time, a card number (when the file has them) or a circuit, and informs of the interval and its vacant places, and last, folded,
  of the categories in several blocks on their circuit (owner: most races mix them on purpose, championships keep one each); the
  table marks the runners (« À vérifier »). `oChecklist` writes the start's file for the Android app O Checklist (Stigning's format, checked on
  stigning.se/startclock/template.html: UTF-8 without BOM, commas, Name, Club, Class, Bib, StartTime hh:mm:ss, Card, StartName, a
  « // » comment line as header, sorted by start), the class a runner's category or the circuit, a start's name per circuit if typed;
  for a file just read, and for the race's deposit (« Vérifier et exporter »: `GET /api/upload?race=&kind=startlist&id=` returns the
  file to its organisers). `localstart.js` keeps card numbers and bibs (IOF `ControlCard` / `BibNumber`, « Puce », « SI », « Dossard »
  columns, OE's chip in PDFs) and a table's rows without a start time (`nostart`), the browser's only: the server drops them. A race's
  published start list on « Résultats » gives its organisers (and administrators) the same file, without card numbers.
- **Réservation des horaires** (owner, 2026-11-03: the Google Sheets clubs pass round for runners to put their names down for a start
  time — Balise 77's: three tabs of three circuits, a start every 2 minutes, long and short on the odd minutes, the middle one on the
  even, « 4 minutes between two runners of a club »): **Orga › Horaires › « Ouvrir la réservation »** (each row of Horaires' list has the button beside « Déposer les horaires », « Gérer la réservation » once opened — owner, 2026-11-05: it was found only inside a competition's page; `#/orga-horaires?course=<key>&resa=1`,
  `pages/bookingorg.js`, organisers as for the start lists: `_lib/club.js` `organises`; competitions `a<agenda id>` and `d<declared id>`)
  sets the circuits (first and last start, interval: `{ id, name, first, last, step }` in seconds), the gap between two runners of a
  club — **whatever their circuits** —, the closing time (Paris), runners per account (10), the card number asked or not (owner: the
  timing software finds it from the name; optional), a note; draft / open / closed. A sheet or file already filled in is imported
  (every tab: `sheettabs.js`; its circuits inferred over one window and interval, each on its own minute; its runners booked as the
  organisers' own, `by_org`, France's club numbers named from the federation's list). The organisers move (`force` past the club
  rule), cancel, add by hand, keep a slot back (`blocked`), publish now, download CSV / IOF XML 3.0 StartList (Paris offset) / O
  Checklist. **The runners' page** `#/horaire?course=<key>` (route `booking`, `pages/booking.js`, Arena; `#/horaire` alone: the open
  bookings and one's own), reached from the Agenda's « Réserver un horaire » and from the link the organisers hand out: the grid
  (names and clubs) is **public** — a signed-out visitor opening the link becomes a guest (`app.route_`, the guest pass; `_middleware.js`
  GUEST `/api/booking(/<key>)?`) —; **booking needs an account** (owner: no account, no booking; no e-mail asked, no private link). An
  account books for its **« Mes coureurs »** (`booking_runners`: the holder added the first time from the account — FFCO club from the
  data, else a club typed for another country —, then anyone: family, friends, licensed or not, a club of France or Spain from the
  federation's list, **a foreign club typed**, or none); one start a runner and competition (licence, else name + club), the club rule
  between clubs of the same key — `FR:<number>`, else `<country>:<name normalised>` (owner, 2026-11-03: a foreign runner picks their
  foreign club and the gap applies to it; `bookingcore.clubKey` = `_lib/booking.clubKey`) —, enforced in one SQL statement (`INSERT …
  WHERE NOT EXISTS`, D1's unique keys for the slot and the runner). Confirmation on the page only (owner: no confirmation e-mail).
  **The alert « Mes horaires réservés »** (Réglages › Alertes; `users.book_mail` off — the administrator's e-mail right — and
  `book_push` on): a start the organisers moved or cancelled, and the reminder the day before (`templates.bookingMail`/`bookingPush`).
  **Closing**: `_lib/booking.js bookingSoon` (from `/api/track`, every 10 min an isolate) closes an open booking past its time, publishes
  its start list as an organiser's deposit (`uploads/<id>/` CSV `Heure;Nom;Club;Circuit;Puce`, meta `booking: true`, then a `prov` run:
  the race's page, the Agenda, the start-time alerts) and again after a change, and sends the reminders. D1 **migration 0023**
  (`booking_events`, `bookings`, `booking_runners`, `users.book_*`; before it the API answers 503 « not ready »). Account deletion: its
  runners and its bookings to come go. Texts: area `i18n/booking.*.js`; the privacy page « Réservation des horaires de départ ».
  Also fixed that day: the start-list grids named each circuit by the next one's title when titles sit in the blank column before a
  circuit (`localstart.grid` = `startlist._grid`, `parsers.VERSION` 11), and `/api/sheet?all=1` reads every tab of a Google Sheet.
- **GPS tracking by another service** (owner, 2026-10-24, after the live tracking study, private artifact
  https://claude.ai/artifact/Y2kZZiMHpZsiPBczSaTVcb: no service grants a third party the right to show its positions, and a web
  page cannot track a phone once its screen locks): Ozimut tracks nobody; a competition's organisers give the link to the
  spectators' page of the service they use (Loggator, GPSSeuranta, TracTrac, Livelox, Routechoices…) in « Organisation › Direct »'s
  card 4 (their club's competitions of the agenda from a week ago to three months ahead, and their declared ones). `functions/api/tracking.js`:
  GET every link of a competition of the last 30 days on (any account; `private, max-age=300`), POST `{ race, url }` / DELETE `{ race }`
  by its organisers (`_lib/club.js` `findRace` + `organises`, https links only, 30 changes a day); R2 `tracking/<race>.json`, the link,
  day and name (percent-encoded) in the object's custom metadata (one R2 list). `site/assets/js/tracking.js` (`links`, read once per
  5 minutes; `linkOf`, `serviceOf`, `button`): Agenda's « Suivi GPS en direct » box and « GPS » tag (France's competitions by their
  agenda id, declared ones by key), the race page of « Résultats » (by its key or `a<agenda_id>`), « En direct »'s race page (the
  link of the same day whose competition's name fits, `sameRace`). The privacy page says only the link is published.
- **Alerts by e-mail and/or push** (owner, 2026-10-18): every alert of Réglages › Alertes (`pages/settings.js` `ALERTS`, a table
  E-mail | Notification) — « une de mes courses est en ligne » (`notify` / `push_results`, both on by default), « mon heure de
  départ est publiée » (`starts_alert`, migration 0011, off / `push_starts`, on; the e-mail `startMail`, once per race and again
  when the time changes, as the push), « nouvelle course dans mes régions » (`agenda_alert` / `push_agenda`) and
  « la clôture des inscriptions approche » (`deadline_alert` / `push_deadline`; push off until ticked) — goes by e-mail, push or
  both. Every alert's e-mail is a right the administrator grants (`users.alerts_allowed`, the admin page's « E-mails » column;
  the results' too since 2026-10-21, owner: the right allows or refuses all the alert e-mails, the account's own e-mails —
  registration, password — apart; without it the e-mail box is not offered; the Resend quota); push is open to everyone; one list of regions for both. **Web Push** without a library (`functions/_lib/push.js`: RFC 8291 aes128gcm encryption and RFC 8292 VAPID ES256 on
  WebCrypto — checked against Mozilla's `http_ece` and FCM, which answers 410 to an unknown token and 403 to a wrong key; only
  the browsers' push services are posted to, `validSubscription`). Keys: `VAPID_PUBLIC_KEY` in wrangler.toml, `VAPID_PRIVATE_KEY`
  a Pages secret (and `.dev.vars`), made by `tools/vapid.mjs` (the private key kept in `C:\kerkia\Ozimut\data\vapid-private.txt`,
  never in the repository); without them push is off (`pushReady`) and Réglages says so. D1 (migration 0010): `users.push_*`,
  `push_subs` (one per device: endpoint, keys, label), `push_queue` (sent a few per call by `flushPush`, 8, the Functions' CPU
  budget; expired rows dropped), `push_sent` (the start time last sent per account and race: sent again only when it changes).
  `/api/notify` queues pushes beside the e-mails (results: `items`; agenda and deadlines: `agenda`; start times: `starts`, which
  `notify.run_push` reads from the provisional results' start lists after every deploy) and returns `pushLeft`;
  `notify._drain_push` calls again while some are left. `/api/push` (GET config, `subscribe`, `unsubscribe`, `test`). The browser:
  `push.js` (registers `/sw-push.js` on its own scope `/push/`, apart from the Tracer's offline `/sw.js`; renews this device's
  subscription once a visit, moving it to the account signed in; `offer`, a small card asking for this device — a browser asks
  only after a click —, again 14 days after « Plus tard »; dropped at logout), the device block of Réglages (state, turn on/off,
  « Envoyer un essai »). A tap opens the notification's page (the worker controls no page: a message to an open tab, else a new
  window). iPhones receive notifications only from the site added to the home screen: `site/manifest.webmanifest` and PNG icons
  (`assets/icon-*.png`, `apple-touch-icon.png`, `badge-96.png`, drawn from the favicon's shapes). The privacy page's
  « Notifications » says what is kept.
- **The installable app (PWA)** (owner, 2026-10-20; `pwa.js`, called first by `app.start` after the bridge): the manifest in the
  site's language (`manifest.webmanifest` / `manifest.en.webmanifest`, same `id` "/"; `pwa.boot` sets the link): shortcuts
  (Classement, Résultats, Agenda, Analyse solo), screenshots from the tour's synthetic pictures (`assets/tour/<lang>/`: never real
  data), `file_handlers` (GPX, FIT, TCX, KMZ → `launchQueue`) and `share_target` (POST `/partage`: traces, KMZ/KML, map photos and
  PDFs). **`/sw.js` is registered on every visit** (it was the Tracer's only, unregistered when no event was kept): a navigation
  without the network gets `offline.html` (served by Pages at `/offline`, its `.html` address redirects; kept in cache
  `ocn-shell-v2` at install; the logo inline), the share's files go to IndexedDB `ocn-inbox` (key "inbox", a day at most) and the
  app opens `/?recu=partage#/analyse-solo`; a file opened with the app goes to the same inbox; « Analyse solo » (and « Analyse »)
  takes it at render or on `ocn:inbox` — nothing is sent. The Tracer's network-first copy runs only while its cache
  `ocn-offline-v1` exists (offline.js tells the worker `{ type: "ocn-offline", on }`; otherwise other requests are not touched).
  « Installer l'application »: the user menu's item and Réglages › « L'application Ozimut » once the browser fires
  `beforeinstallprompt` (Chrome, Edge, Android), else how to (iPhone: Share › « Sur l'écran d'accueil »). An install made on
  ocn.kerkia.com stays on that origin (the bridge then moves its visitor to ozimut.com in a browser tab).
- **Orga › Cartographier** (`#/orga-carto`, route `orgMapper`, `pages/mapper.js` + `site/assets/js/mapper/`; owner, 2026-11-06, after the
  study of OCAD and OpenOrienteering Mapper, private artifact https://claude.ai/artifact/2MiaTY5wo677yPPaPJ8Fey): drawing and updating
  orienteering maps in the browser with the Tracer's ribbon. **Every account's since 2026-11-07** (owner; the administrators' the day
  before; an Orga page, and on a phone too, for the field mode — the one Orga page a phone opens), a beta notice (`beta.js` `mapper`).
  **It opens as the Tracer does** (owner, 2026-11-07): the editor at once, empty (`openEditor({ blank: true })`: read-only, nothing
  saved, no team; a command says « Ouvrez, créez ou importez d'abord une carte » and leads to the start screen, a map file dropped is
  imported), and over it the start screen in the Tracer's look (`pages/mapper.js` `startScreen`, `.tr-start`: Nouvelle carte, Importer
  une carte, Ouvrir une carte — one's maps, the open one tagged, one's own deletable); the editor's folder button and Fichier › Nouvelle /
  Ouvrir / Importer bring it back, Fichier › Fermer leaves the empty editor; texts `map.start.*`, `map.ed.*`. The LiDAR maps
  (`/api/lidarmap`) are every account's with it: 5 requests a day an account, the administrators 20. Owner's decisions:
  `.ozmap` is Ozimut's own format and holds everything needed to write the map back to OCAD; the Tracer's « Générer une carte »
  moved here (the Tracer's new-event dialog now only points to Cartographier, `trc.gen.toMapper`); all phases built at once.
  **The document** (`docs/mapper/model.md`): OCAD's own records as `tracer/vmap/ocad.js` reads them (OCAD 9+ numbering, 0.01 mm,
  coordinates with their flags), each with `rawAt` in the source file kept beside the document (`source.ocd`); `readOcad` returns
  `records` and exports `compileSymbol`, `compileObject`, `makeContext`, `applyParams` (the layout's logos and order from the parameter
  strings: never dropped). `doc.js` `Live` compiles one record at a time into a `VMap`, indexes objects in 20 mm cells, edits by
  transactions with undo (`add`, `remove`, `update`, `updateSymbol`, `setColors`, `setDocField`); OCAD 6-8 renumbered on import
  (`num*10+sub` → `num*1000+sub`, circle diameters to the line's middle), new maps and Mapper's compiled with OCAD 2018's meanings.
  **Writing OCAD** (`mapper/ocadout.js` `writeOcadDoc(doc, source, { version })`): an untouched document is the source byte for byte;
  else clean records copied byte for byte, dirty ones written over their raw bytes (what Ozimut does not read survives), new ones
  serialized from every field; index slots kept (course strings point at their objects); colours, scale/georeference and print
  strings rewritten only when `doc.dirty` says so; hidden objects (status 2, not in `records`) carried through; 9-11 ↔ 12/2018
  converted. Tested on 82 files (`tools/mapper/t_ocadout.mjs`): unchanged → identical, every record dirty → byte-identical records,
  serializer alone → deep-equal read back. **Not yet opened in OCAD itself.** **Mapper** (`fromomap.js` `omapToDoc`, `toomap.js`
  `docToOmap(doc, { losses })`): symbols turned into OCAD records and back (combined symbols flattened into duplicated objects,
  noted in `omap` fields for the way back; text symbols one record per alignment), losses keyed `map.omap.loss.*` / `lost.*` and
  said after an import or export (`io.sayLosses`); tested on 32 Mapper and 62 OCAD files (`t_omap.mjs`), not yet opened in Mapper.
  **Symbol sets** (`mapper/sets/isom2017-2.json` at 1:15 000, enlarged 150 % for 1:10 000 by `layout.scaled`; `issprom2019-2.json` at
  1:4 000; `minimums.json` the specifications' minimum sizes), written by `docs/mapper/sets.mjs` from `isom.js`'s dimensions and the
  specification texts; every symbol of both, variants and helper symbols as `.1`… / `.8`, `.9`, approximations noted in `note`;
  **their CMYK not yet checked against the specifications' colour appendix**. Names shown from the site's catalogues (`ms.s.*`,
  `ms.sp.s.*`: `panels.symName`), a file's own symbols by the name it gives. **ISOM 2017-2 revision 6** (January 2024, mandatory
  since 2025; owner, 2026-11-12: Cartographier lacked it), read in the Czech federation's translation and its errata of 2020-2024
  (`isomrev6cz.pdf`, the English one at the IOF): 105 → 105.1 and 105.2 retaining earth wall, 203 → 203.1 and 203.2 dangerous
  pit, 513 → 513.1 and 513.2 retaining wall, 715 continuing point after map exchange (on forest maps too: `isom.js SPRINT_ONLY`
  lost 105.2, 513.2, 715); 104 0.25, 307's outline 0.12, 415 0.10, 601 blue 0.12, 214 black 35 %, large buildings black 50 %,
  408's stripes green 30 %, 709 hatching 0.2 every 1.2, 520 without its black stripes (a path through it on white), and the
  minimum sizes. **The white masks under 417 and 419 and 418's white centre** (owner, 2026-11-12; both sets): an OCAD map draws
  colour by colour, so the mask is a colour of its own (« White (mask under green point symbols) ») above every yellow and green
  area, and the three symbols are drawn in « Green 100% (point symbols) », the same ink one place higher; forest 1.1 mm and
  0.36 / +0.18 mm, sprint 1.4 mm and 0.50 / +0.25 mm. ISSprOM's set: bare rock
  black 35 % and 513.2's 1.4 mm (its drawings were already revision 6). Maps made with the earlier set keep 105, 203, 513:
  `symName` finds them as `.1`, and the importers' walls (513.1, 513.2) and earth walls (105.1: `osm.js`, `bdtopo.js`, `ch.js`) land on
  their plain number there (`dataui.bring`'s `symIn`; a plain number finds its `.1` too). The set's `standard` stays « ISOM2017-2 » (the IOF's name for every revision).
  **The page**: start (one's maps, « Nouvelle carte » — sprint (1:4 000) or forest, **1:15 000 by default, ISOM's own scale** (owner, 2026-11-12: it made
  every forest map at 1:10 000; 1:10 000 is a choice, its symbols enlarged 150 %), its place in Lambert 93 in France else UTM, its size, the
  open data to start from —, « Importer » OCAD/Mapper/.ozmap); the editor (`editor.js`): ribbon (`ribbon.js` data: Dessiner,
  Modifier, Fonds, Données, Terrain, Vérifier, Mise en page, Imprimer, Équipe, a contextual tab by the selection's kind, Alt+Q
  search), symbols on the left (`panels.js`, swatches drawn by the map's engine), selection / parts / backgrounds / colours / problems
  on the right, a status bar (coordinates, Lambert 93 or the grid, lat/lon, IOF minimum warnings while drawing); under 900 px the
  panes are drawers. The view (`view.js`): three canvases, the map in 256 px tiles per √2 zoom level drawn from the index
  (`drawRect`), an edit invalidating its box only. Tools (`tools.js`): select (box, Shift, drag, arrows), vertices (handles, add,
  Alt-click removes, double-click corner), draw (straight, curve by drag, freehand, right angles, circle; snapping to points and
  lines, Shift 45°), fill (flood fill of a raster of the lines around the click, traced), cut (a line at a point; areas along a line),
  cut hole, measure; union / difference / intersection (`boolean.js`, polygon-clipping 0.15.7 vendored), join, reverse, smooth,
  simplify, change symbol, rotate, duplicate, order, parts. **Data** (`dataui.js` + `data/`): contours from IGN's RGE ALTI or the
  terrain tiles (`data/contours.js`), OpenStreetMap through Overpass from the browser (`data/osm.js`, mapgen/osm.py's classification
  as objects), the LiDAR's vectors (`data/lidar.js`: `mapgen/run.py` now keeps karttapullautin's DXFs — `savetempfiles=1`,
  `output_dxf=1` — as `t/<id>.<style>.vec.json` via `mapgen/dxf.py`, plus `t/<id>.<style>.vege.png`; tiles made before have no
  vectors, `noVectors`), all in a « Brouillon » part, `draft` and `src` on each object, « Accepter » / « Rejeter ». Checks
  (`checks.js`), layout (`layout.js`: print area, magnetic north lines, scale bar, legend, logos as OCAD layout images, credits, QR),
  exports (`io.js`: OCAD, Mapper, .ozmap, vector PDF in CMYK, PNG + world file + .prj, KMZ; to the Tracer and Mes cartes through
  `pwa.handOver`, which `pages/tracer.js` and `pages/mymaps.js` take on `?recu=1`), field mode (`field.js`: GPS with accuracy,
  follow, track kept as a GPX background, compass north-up, photos and notes pinned, offline copy in IndexedDB `ocn-mapper` with
  saves waiting), team (`team.js`: invitation links « mapper » / « viewer », versions every 30 min of work and named, restore,
  comments). **Storage**: `functions/api/mapper/[[path]].js` (R2 `mapper-meta/`, `mapper/<id>/doc` gzip JSON, `source`, `files/<sha>`,
  `v/<n>`, `comments`, `photo/`, `lock`, `invites`; 40 maps an account); account deletion hands a map to its first « mapper », else
  deletes it; the privacy page says so. Texts: area `i18n/mapper.*.js`, written by `tools/mapper/catalogue.py` (edit there).
  **Added the same evening (owner: « build it »)**: the **symbol editor** (`symedit.js`: a record edited field by field by its kind,
  element lists as « x y; x y » in mm with « *1 »/« *2 » for Bézier handles, a live preview compiled in a context of its own, new
  from a copy or blank, renumbering moves the objects, deletion only when unused; Mise en page › Symboles, double-click or right-click
  in the palette); **colours and spot inks** (`colors.js`: the colour table edited — order, CMYK, overprint, each colour's inks
  « Nom 100 » —, the inks themselves — CMYK, frequency, angle —; read from OCAD's type-9 « s/p » pairs and type-10 strings
  (`spotsFromParams`, also for documents saved before), written back by `ocadout.js` when `dirty.colors` / `dirty.spots`);
  **separations** (Imprimer › Séparations: a composite PDF painting single-ink colours in PDF « Separation » colour spaces, or one
  page per spot ink or per CMYK ink — black at the colour's share, a colour the plate does not print knocking out unless it overprints
  —, registration marks and plate names; the Tracer's engine too since 2026-11-12, see « Printing for a print shop »); **IGN BD TOPO** (`data/bdtopo.js`: the WFS `data.geopf.fr/wfs/ows`, CORS open, ten layers in
  Lambert 93, roads by their width — sprint: paved bands at « largeur de chaussée » + sidewalks in town —, buildings, water, walls,
  banks, hedges, parkings; Données › BD TOPO and the new-map dialog, France only, OpenStreetMap elsewhere); **several mappers at once**
  (`collab.js`: no exclusive lock any more — presence every 30 s at `/api/mapper/<id>/presence` with each one's pointer and **sector**,
  a rectangle the others' editors refuse to change (`Live.guard` → `check`, error code « sector »); saves made on an older version
  merged object by object with the last common version (`merge3`: added, changed, deleted; symbols by number; settings by field; both
  changed: the change inside one's own sector wins, else the teammate's), an idle editor taking a teammate's version when it sees it;
  new objects get ids unique across editors, `doc.newId`). Tests: `t_merge.mjs`, `t_spotw.mjs`, `t_bdtopo.mjs` (live WFS).
  Node tests: `node --import ./tools/mapper/shim.mjs tools/mapper/<t_*.mjs>` (`npm install` in `tools/mapper` for xmldom); local
  page: launch config `pages-dev-mapper` (8780, the test account an administrator).
  **Third pass (owner, the same evening: « address the 2 points not done, generalisation as a guided tool, Switzerland, USA, Canada
  and New Zealand »)**: **DeviceN** — the spot-ink composite paints a colour mixing several inks in a PDF DeviceN space of those
  inks (its tint transform a PostScript function to CMYK, `colors.js` `deviceNOf`), a colour of one ink in a Separation space as
  before. **Mapper's combined copies kept in step** (`doc.js` `groups` by `omap.o`, `siblings`, `siblingCoords`: a copy's
  coordinates follow the one changed — an area's border lines follow its rings —, deleted together, `_sync` under undo; the
  editor's geometry edits act on one object per group, `E.lead`; a duplicate is a group of its own; `t_combo.mjs` gives the sample's
  canopy a second line part, the sample files' combined symbols all becoming one OCAD record otherwise). **Generalisation**
  (`generalise.js`, Vérifier › « Généraliser », a right-hand pane `gen`): a guided sequence — the scale changed (symbols scaled by
  `layout.scaleSymbol`, the IOF minimums left), then each step found, shown, applied or skipped: objects under the minimum size
  (enlarged or deleted), lines with points closer than the scale needs (simplified), overlapping areas of one symbol (united,
  up to four passes), crowded point objects (thinned), contours closer than the line widths (listed, by hand); each step one undo.
  **Four more countries** (`trace/terrain.js` `countryAt`, `sourcesAt`): the terrain model swisstopo swissALTI3D, USGS 3DEP
  (ImageServer), NRCan HRDEM (COG), LINZ 1 m DEM (COG), read by geotiff.js 2.1.3 (vendored, `vendor.GEOTIFF`), else the AWS tiles;
  the country's vectors under Données › « Données nationales » (`data-national`, `dataui.nationalSource`: France BD TOPO,
  Switzerland swissTLM3D through swisstopo's vector tiles — `data/mvt.js`, `data/ch.js`, 64 tiles at most —, the USA The National
  Map's TIGER roads and trails, NHD (its server slow: past 75 s the 3D Hydrography Program stands in) and FEMA's USA Structures —
  `data/us.js`; Canada and New Zealand: OpenStreetMap); online backgrounds by country (`backgrounds.ONLINE` `country`: SWISSIMAGE and
  the national map in Switzerland, USGS imagery and US Topo in the USA, LINZ aerial in New Zealand once a LINZ key is set,
  `LINZ_KEY`, empty for now); a new map's grid by country (`pages/mapper.js realWorldAt`: Lambert 93 in France, LV95 2056,
  NZTM2000 2193, NAD83 / UTM in the USA and Canada, else WGS 84 / UTM; a rough France box took Bern before `countryAt`). Checked in
  the browser: Bern's old town (1 477 objects from swisstopo, SWISSIMAGE aligned), Central Park (3DEP contours, TIGER roads, the
  lake, FEMA buildings).
  **Generated maps abroad** (`mapgen/grids.py`, `mapgen/sources.py`; the workflow, the API and `trace/lidarmap.js` follow):
  1 km tiles in each country's grid, named by their west and **south** km — `ch_2583_1219` (LV95, swissSURFACE3D's zipped LAS
  through swisstopo's STAC API, newest year), `us_13_0475_4427` (UTM zone, USGS 3DEP's point tiles on AWS `usgs-lidar-public`,
  projects from Hobu's `resources.geojson`, reprojected from Web Mercator), `ca_18_0433_5038` (UTM zone, NRCan CanElevation's
  COPC on S3, its 450 MB index read by HTTP ranges through its R-tree with apsw, one project a tile), `nz_1571_5172` (NZTM2000,
  LINZ's point clouds on OpenTopography's public bucket, by sheet and tile names); France's `0391_6819` (west, **north** km)
  unchanged. Abroad a tile's margin is written as `edge_<neighbour>.laz` so that karttapullautin draws its edges with real points
  (Switzerland, as France, none); runs grouped by grid in `work/<grid>/`; the record gains `crs`, `country`, `src`, `project`; a
  tile abroad counts double toward a round's 16; `lidarmap.yml` installs `laspy[lazrs] pyproj requests apsw` in a step of its own
  (`continue-on-error`: France's path never depends on them), 120 min. `trace/lidarmap.js`: `countryAt` (simplified Swiss and US
  borders embedded, boxes elsewhere), `tileIdsFor`, `gridOf`, `gridOfName`, `CREDITS` / `creditOf` (each country's point clouds
  credited with their licence: IGN Licence Ouverte 2.0, swisstopo, USGS 3DEP, NRCan OGL-Canada 2.0, LINZ CC BY 4.0); a composed
  map's world file in its grid (Switzerland's in UTM 32, georef.js having no oblique Mercator: 1 cm over 4 × 3 km). Analyse solo's
  generated maps and their 3D view, and Cartographier's « LiDAR » (each tile placed by its own grid, `data/lidar.js` `toMm`;
  `t_lidarabroad.mjs`), take them. Measured on the PC (one tile each, karttapullautin 4-35 s): Switzerland 1.75 M points, download
  8 s; the USA 27.7 M, 85-95 s; Canada 47 M, 125-134 s; New Zealand 20.8 M, 330 s the first time (338 MB at 1 MB/s). First CI run
  2026-11-06 (one forest tile each, the same four): all made in 13 min with OpenStreetMap drawn over (Lake Biel, Boulder's houses
  and streets in the LiDAR's gaps, Gatineau's lakes); the same four in sprint style in ~24 min (paved streets, grey houses, olive
  gardens and 2.5 m contours as in France; steep hills come out dark brown); a full 12-tile request (us_13_0478..0481 ×
  4426..4428, Denver's suburbs) in ~10-14 min, no seam at the tiles' corners; vector files up to 56 MB (New Zealand sprint).
  **The wait shown** (owner, 2026-11-07: « a progress bar with relevant information »): `run.Progress` reports with each stage
  the country, the run's tiles, a counted stage's done / total, the seconds in the stage and the part of a run over several grids
  (the bar over all parts); the API's `?req=` adds `ahead`, the requests still queued before an unstarted one (`aheadOf`, the
  last six hours) and sends the tiles' files with their length; `lidarmap.waitFor` (shared by Analyse solo's `make` and
  Cartographier's `ensureTiles`) shows every 2 s the stage with its source (`SOURCE_SHORT`), « 3 dalles sur 12 », « partie 1
  sur 2 », the queue (« 1 demande avant la vôtre ») and the time waited; Cartographier then counts the tiles' files read with
  their MB (`fetchTiles` onProgress) and says while their vectors become objects. OpenStreetMap's Overpass, which answered in ~10 min on the first
  real run (2026-11-07, Magglingen: the bar sat at 0.68 for 7 min), is said as such: after 2 min « répond lentement : m:ss pour
  l'instant », on a retry « essai k sur 6, serveur … » (`osm.query` `on_attempt`, `Progress.note`); `OSM_EST` 240 s.
  **Where a place has no specific support** (owner, 2026-11-06: « mappers work across countries », so this follows the place
  mapped, never the account's countries or Ozimut's rankings): `mapper/support.js` (`at(lat, lon)`: national terrain model,
  national data, LiDAR, national backgrounds) says what is missing and invites to ask Ozimut for that country (« Demander la prise
  en charge », « Nous écrire » with the place in its subject) — under the new-map dialog as the place is typed, in the contours'
  and online backgrounds' dialogs, and as a dialog of its own for « Données nationales » and « LiDAR » there; Analyse solo's map
  generation outside the LiDAR countries likewise (`an.gen.ask`).
  Not done: other countries' data (the Netherlands, Sweden, Spain, Belgium, Germany's open Länder next).
  **The LiDAR dialog** (`dataui.lidar`; owner, 2026-11-12): the map's style decides, the **contour interval** is chosen (sprint 2.5
  or 2 m, forest 5 or 2.5 m; kept in `localStorage ocn.map.lidar.<style>`), **helper contours** offered (on by default: symbol
  **996**, « Courbe d'aide (LiDAR) », a 0.08 mm line in a new colour « Violet 30% (helper contours) », the sets' colour 32, last so
  no number moves — a helper, never printed —, into a part of their own, « Courbes d'aide (LiDAR) » (`HELP_PART`), not drafts; a map
  made before gets the symbol and its colour from its set, `layout.addSetSymbols`), **karttapullautin credited** (Jarkko Ryyppö,
  GPL-3, MapAnt's tool, its GitHub) and its **settings listed** (« Réglages de karttapullautin »: `data/lidar.js kpRows`, a mirror
  of run.py's, each with what it does, `map.data.kp.*`); they are not adjustable: a tile serves every mapper. The guide's « Le
  LiDAR et karttapullautin ».
  **One set of contours** (owner, 2026-11-12: « un million de courbes » — the terrain model's, the town plan's and the LiDAR's came
  in together): a new forest map takes the LiDAR's when ticked (the terrain model's box then unticked and greyed), else the terrain
  model's; a sprint map keeps the town plan's or the terrain model's (drawn by the town plan's rules), the LiDAR's coming only where
  those are not (`reliefCover`); an import over draft contours of another import asks to replace them (`dataui.oneContourSet`:
  « Remplacer » / « Garder les anciennes »; a forest map's LiDAR import, its cliffs, knolls and vegetation coming either way). **karttapullautin's c3g** (« cliff3 », « cliff4 ») is every steep spot — 30 times c2g's strokes along the same cliffs in
  Gif's town, 1.2 million over an Autrans tile (28 MB of its 28.4) —, while its own image draws c2g's: mapgen writes it apart
  (`<id>.<variant>.steep.json`, read by Virtually's lidarrace.py for its rock) and Carto takes c2g's cliffs only, as 202 (the
  mapper makes one impassable on the ground); the Autrans tile: 502 objects in 1.4 s, 80 cliffs. (2026-11-12; ribbon Données › `data-town`, `dataui.town`): a sprint map's town made by **the
  generator Pixel's town races use** (Virtually › « Sprint in a town », « A mapper's review »), run on GitHub — the owner's choice
  the same day, after a browser port of its rules had been written (JSTS, removed): « any mapper will rather wait many more minutes
  if it saves tons later; what matters is quality », and one engine keeps every future review in one place. The page sends the
  area's centre and size (France only, 2 × 2 km at most: `TOWN_MAX`) to **`/api/townmap`** (`functions/api/townmap/[[path]].js`:
  R2 `townmap/req/<id>.json` — `{ id, lat, lon, w, h, by, at, status, progress, result, error }` —, a rough France box, 3 a day
  an account, the administrators 20; `GET ?req=` its state and the queue ahead, its owner's or an administrator's; `GET /out/<id>`
  the objects, gzipped, passed on with `encodeBody: "manual"`), which starts **`.github/workflows/townmap.yml`**
  (workflow_dispatch, `GH_DISPATCH_TOKEN`; rounds until no request waits): **`tools/virtually/townmap_ci.py`** checks the border
  (`ci.in_france`), runs `town_fetch.py` (IGN's LiDAR HD, BD TOPO, BD ORTHO and its infrared, the cadastre, OpenStreetMap) and
  `town_map.py --clip`, fails clearly without LiDAR, writes `townmap/out/<id>.json.gz` (map_objects.json with `area`, `lidar`
  dates, `cadastre`), its stage and share into the request every 8 s (fetch 0-50 %, map 50-95 %, upload), and deletes requests and
  results after 30 days; `BUCKET=file://<folder>` runs it on the PC (`ci.py`'s helpers). The page waits (`waitTown`: every 10 s, the
  stage, the share, the queue, the time waited), keeping the request in `localStorage ocn.map.town.<map id>` so that a page closed
  meanwhile takes the map when the editor opens again (`resumeTown`, from `pages/mapper.js openEditor`; `E.closed` stops a wait);
  then `townObjects` brings it in: each point through Lambert 93 into the document's frame (`frame.fromL93mm`), lines marked
  `curve` as Bézier curves, the north lines (601) left out (« Mise en page » draws them), the contours too when not asked for; the
  town symbols a map made before lacks added from the set (`ensureTownSymbols`). « Nouvelle carte » sprint in France runs it (with
  its contours when « Courbes » is ticked) in place of the national, OpenStreetMap and contour imports; elsewhere they stay.
  **Every contour import is Bézier curves** (`frame.js bezier`, Catmull-Rom; `contours.js` `curve`). **The helpers 900 and up are
  never printed**: Cartographier's PDF, image and separation exports leave them out (`view.drawRect` `print`). Each Overpass
  attempt from the browser is given up after 150 s (`osm.fetchOverpass`: a busy server never answered). Measured on the PC
  (2026-11-12, `townmap_ci.py` with a folder for R2, 500 × 500 m of Gif-sur-Yvette's centre, the four LiDAR tiles already there):
  328 s — BD TOPO, BD ORTHO, the cadastre (Etalab) and Overpass fetched live, the map 97 s —, 2 649 objects, 404 KB gzipped,
  LiDAR of April 2023; the dev server's API checked (a request, its state, the refusals: too large, the rough box), the import by
  putting that result in its local R2 and reopening the map (`resumeTown`: 2 421 objects, the north lines and 222 empty OSM ways
  left out — `town_map.py` no longer writes the latter).
  **Faster and said** (owner, 2026-11-12: « en attente d'un serveur de calcul » then « calcul de la carte · 8:34 »): `town_fetch.py`
  asks its sources at the same time (a thread each: IGN's downloads two at a time, IGN's WFS/WMS, the cadastre, Overpass; a request
  a second to each service, `Pace`) and prints `@@done <source>`; the photographs at 0.5 m for the town plan (`TOWN_ORTHO_PPM` 2,
  files `ortho2_…`; Virtually keeps 0.2 m); `town_map.py` reads the point clouds by their COPC octree, the area only and the fields
  used (`laspy.CopcReader.query`: ~20 s → ~2 s a tile) and prints `@@step <name>`; `townmap_ci.py` streams the steps' output
  (`stream`) into the request's progress (`pending` sources, `osmTry`, the map's `step`), and `--setup` marks the waiting requests
  « setup » as the job starts (townmap.yml, before pip — cached); the page says « préparation du calcul » until the sources come
  (the runner starting and installing counted as part of the making, never « waiting for a server »: owner, 2026-11-12; only other
  users' requests ahead are said, `ahead`), then « téléchargement, encore la photo aérienne et OpenStreetMap », « calcul de la carte —
  surfaces… » (`townStage`, `map.data.town.*`); the LiDAR's wait likewise (`waitFor`: `an.gen.queued`, no `an.gen.waiting`). Measured on the PC, the same 500 × 500 m of Gif with its LiDAR there: 229 s → 90 s (sources
  2:14 → 47 s, the map 95 → 41 s), the same objects (2 524 against 2 508: the paving read on the 0.5 m photo).
  Not done: a run on GitHub itself (the first real request will be it), other countries (their LiDAR, cadastre and photographs).
- **Organisation › Tracer** (`#/orga-tracer`, route `orgTracer`, `pages/tracer.js` + `site/assets/js/tracer/`; owner, 2026-10-15,
  after the Purple Pen study, private artifact https://claude.ai/artifact/Vi5wAeHwMkpsDtvo6x7gFv): course setting as Purple Pen
  does it (phases 1-3 of the study; OCAD and Mapper maps since the third pass, below), in the browser. **No AGPL code**: Purple
  Pen's own code is BSD (attribution `site/assets/tracer/LICENSE-PurplePen.txt`), its symbols and texts converted by
  `docs/tracer/symbols.py` into `site/assets/tracer/symbols.json` (fr/en) and `symbol-texts.json` (23 languages). The model
  (`model.js`) mirrors Purple Pen's EventDB, QueryEvent, CourseView and ChangeEvent (controls, courses as linked course controls,
  forks and loops, map exchanges, legs with bends, gaps and flagging, specials, print areas, all in map mm, y up); `ppen.js` reads
  and writes **.ppen** (round trip checked on 15 sample events; « Purple Pen » is named as the file format the Tracer supports);
  **the Ozimut file** (`ocnfile.js`, owner, 2026-10-17: ours to evolve; « fichier O'CN » until 2026-10-19) is a `.ozmt` zip
  (`.ocnt`, its former extension, still opens everywhere: `isOcnFile`, `ACCEPT`; the content marker stays `ocn-trace`) — `event.json` `{ format: "ocn-trace",
  version, app, saved, title, map: { file, type, size } | null, event }`, `event` being the model's own event (all a .ppen holds plus
  O'CN's additions: georeferencing, routes, publication links…, in the event's frame), and `map/<name>` the map file itself when
  included (Fichier › Exporter au format O'CN, the stored map's name from the event's meta; checked byte for byte and event for event
  on a round trip); a file of a newer `version` or model `v` is refused with a plain message; not encrypted, which the export says
  for an encrypted event; `layout.js` = CourseFormatter (number placement, automatic
  cuts), `draw.js` the canvas and PDF items, `descr.js` + `textify.js` the description sheets (symbols and text, any language),
  `pdf.js` the PDFs (pdf-lib, the PDF map embedded as a vector page; courses, per part, per variation or relay team and leg;
  descriptions; punch cards; print areas), `exports.js` IOF XML 3/2 (relay team assignments), GPX, KML, images with world file,
  RouteGadget; `relay.js` Purple Pen's relay variations with .NET's seeded random generator (seed 8713527: the same teams as
  Purple Pen; checked `Random(0)` = 1559595546); `reports.js` its five reports (summary, leg lengths, cross-reference, load,
  event audit) plus O'CN's checks (IOF distances per discipline, out-of-bounds areas and boundaries crossed, legs through another
  circle, dog-legs, short legs, codes < 31 or read upside down, courses that leave one start for the same first control, and as a
  reminder for first controls in nearly the same direction, under 15° — 2026-10-22), shown, printed or as CSV (« ; », UTF-8 BOM). The editor
  (`editor.js`, `actions.js`, `panes.js`, `dialogs.js`) is drawn in the page under the site's menus, as the analyses are (owner,
  2026-10-15: the former full-window overlay left no obvious way back to the site): `.tr-app` in `#main` (`ctx.container`), its
  height fitted to the window (`fitHeight`), `body.tr-open` widens the page and hides the footer. **The page opens the editor at
  once** (owner, 2026-10-17), empty (`ctx.blank`: read-only, no lock, no save, « Aucun événement ouvert »; a change, a drop or any
  menu but the views leads to the start screen), and over it **the start screen** (`pages/tracer.js` `startScreen`, `.tr-start` in
  the editor's root): Nouvel événement (a competition of one's club or a training; the map), Importer un événement (a .ocnt, its
  map inside, or a .ppen and its map), Ouvrir un événement (one's events, listed inside); each card says what it needs; files dropped
  on it choose (a map alone: new; a .ocnt or .ppen: import); Échap or « × » closes it; « Événements » (the top bar's first button)
  and Fichier › Nouvel / Ouvrir / Importer bring it back (`ctx.onStart`), over the open event; a link with `?id=` opens the event
  directly; a dialog given up with no event open goes back to it. **Deleting an event** (owner, 2026-11-04: there was no way to):
  the bin on one's own events in « Ouvrir un événement » (`deleteEvent`; the owner only, as the API's DELETE), after a confirmation
  — gone for the whole team, its offline copy on this device too (`offline.dropEvent`); an analysis published from it stays; the
  event open here gives way to the empty editor. Switching events closes the open one first (`closeEditor`:
  saved, lock released); the editor closing by itself (↗) leaves the empty editor and the start screen; the analyses' « ⤢ » / « ↗ » (`fullwin.js`) — ↗
  saves, opens the event alone in a tab and closes it here (`setTabHandler`; one event, one tab), Échap first cancels the
  editor's own pick, drawing, tool or selection (`setEscapeOwner`); a
  change of page closes it (saved). With Purple Pen's tools and insertion rule,
  undo (100), autosave 1.8 s after a change, a version every 30 min of work, an editing lock (`/lock`, 150 s, refreshed every
  minute; same account = no lock). **Who**: a competition's event is created by a member of the race's organising club (an agenda
  race `a<id>` or one of « Résultats »), a training's by anyone; only the **team** opens it (creator + licences added: setter,
  controller edit, viewer reads and comments) — **not the administrators**: the courses are secret. Optional **end-to-end
  encryption** (AES-GCM, PBKDF2 250 000 from the team's passphrase; header "OCN1"; the key in `sessionStorage ocn.tr.key.<id>`,
  cleared at logout): event, map, comments and versions unreadable by the server. Storage R2 only (`functions/api/tracer/[[path]].js`:
  `tracer-meta/<id>.json`, `tracer/<id>/event|map|v/<n>|comments|field|lock`), optimistic versions (409 → keep mine / reload).
  **Beyond Purple Pen** (`extras.js`, `race.js`, `team.js`): georeferencing (points clicked + lat/lon, world file + .prj, KMZ/KML;
  `ev.geo` affine (lon, lat) → mm, `ev.georefPts`); climb along the legs from IGN's elevations (`data.geopf.fr` elevationLine,
  RGE ALTI, every 10 m, light smoothing; CORS open; only coordinates are sent); winning times (the winners' pace on the last two
  seasons' races of the format, `competitions.json` + `c/*.json`, ln pace on ln official CN J-15, the categories' median winner CN
  as default, the length for a target time; climb not modelled — the reference files have none); loads and categories from FFCO's
  registration counts (`agenda.reg.circuits`); a pick-up plan (last starts from the published start lists, a slow pace, k-means
  sectors per collector); a review after the race from « Résultats »'s split times (per leg: best, median, share of mistakes as
  « Temps intermédiaires » counts them, missing punches); publication to « Analyse multi » (since 2026-11-05, owner: one dialog holds every setting of the analysis — circuits, image resolution, its name (may differ from the event's), date, access with password — 2 characters at least, on the server too — and visitors, the runners' switches `opts` (« Actions activées »), then « Publier » or « Enregistrer en brouillon » —; a window opens at once with the progress (`progressBox`: each circuit printed, then sent), then « Ouvrir l'analyse de carte » and « Gérer l'analyse »; the dialog's first choice is a new analysis (the default) or an update of one already published from the event (`meta.published.analyses`, the last 20; owner, the same day: a second publication under another name had replaced the first) — a competition has one, its own; after the race date only for a
  competition; one circuit per course or variation, 12 at most, the map PNG with the course printed, controls in px, `geo`
  composed — checked to 0.1 px); a course read from a printed map (`trace/course.js` at full size, order by nearest neighbour to
  be checked); team comments pinned on the map; the **field mode** (phone GPS on the georeferenced map, nearest control with
  distance and bearing, states set/checked/collected/problem with the phone's position, queued in `localStorage
  ocn.tr.field.<id>` when offline); version differences; other courses shown faint. Account deletion hands an event to the first
  setter (else controller) of its team who has an account, else deletes it; the privacy page says so. Local tests: Purple Pen's
  samples in the git-ignored `site/data/_trtest/` (their .ppen were made for OCAD maps: controls can lie off the JPEG).
  **Second pass (owner, 2026-10-15: « complete phases 1-3 »).** Import: one dialog (`importEvent`), the .ppen and its map dropped
  together or one after the other (`dialogs.dropZone`), each file confirmed as read, or a .ocnt alone (opened as saved, in its own
  frame, when its map is inside or the same file is given; another map goes through the calage); files dropped on the start screen,
  « Nouvel événement », « Changer de carte » or the editor are taken too; the OCAD or Mapper file, or any PDF or image of the map (never assume OCAD is at hand). A map that is
  not the .ppen's own file is aligned by two clicks (`calage.js`: least-squares similarity; a .ppen keeps true map mm, so the
  scale found corrects the image's dpi or the PDF's scale, not the course), also Événement › Caler les postes sur la carte.
  TIFF read by `tiff.js` (strips/tiles, none/LZW/Deflate/PackBits, predictor, 1-16 bits, palette, planar; a GeoTIFF's
  tie point/scale/matrix + EPSG 2154/326xx/4326 georeferences the event; checked pixel for pixel against Pillow on 13
  variants); large images drawn from reduced copies (`mapsrc.withLevels`). Fonts as Purple Pen (`fonts.js`): Roboto and
  Roboto Condensed from fontsource (vendored) + fontkit, their widths for layout and description sheets
  (`DescriptionAppearance` sizes), embedded in the PDFs; Arial numbers = Helvetica (same widths); offline fallback to
  Helvetica and Purple Pen's « no Arial Narrow » sizes. **Every language** (2026-10-15): fontsource's subsets read from each
  face's CSS (unicode ranges), the basic Latin ones with the editor, the others (latin-ext, cyrillic, greek…) when a text needs
  them (`ensureText`, the editor's `fontCheck` over the event's strings and its language's symbol texts; « tr-fonts » lays out
  again), Chinese and Japanese from Noto Sans JP/TC/HK by the event's language (`setLanguage`); texts measured, drawn and
  printed run by run (`textRuns`), each subset embedded on its own. The language menu lists the symbol file's 23 languages.
  Text objects print in the font they name (`family`): Roboto, Roboto Condensed, sans serif faces in Helvetica, serif ones in
  Times, fixed-width ones in Courier (the PDF standard fonts, their widths in `STDW`), bold and italic (Roboto's italic faces
  loaded). Course images also in GIF (`gif.js`: exact palette up to 256 colours, else median cut; LZW; world file .gfw). PDFs: print areas larger than the paper tiled over pages (Purple
  Pen's layout), a drawn print area, even-odd fills (raw `f*`: pdf-lib has no helper). Description sheet by keyboard.
  Several files into a chosen folder (File System Access) or a zip (`dialogs.saveFiles`). Route tool (`ev.legs[].route`,
  not in .ppen, not printed) used by the IGN climb. Winning times: climb effect fitted on « Résultats »' circuits with
  climb (winner time vs the CN model, by m/km), shrunk toward the km-effort rule (+10 % per 10 m/km) by its precision.
  Field mode: photos (`/photo/<pid>`, 1600 px JPEG, queued in IndexedDB `ocn-tracer` offline), a warning when marking a
  control far from the map's spot. Offline (`offline.js`, `/sw.js` network-first, opt-in per event; the event and map
  re-encrypted with the event's key; saves wait in IndexedDB « pending » and go when online, a conflict asks; the worker
  and cache go when nothing is kept; logout drops copies without pending changes). « Envoyer les circuits à Résultats »
  (from the race day; upload kind « courses », see Uploads); owner, 2026-11-05: kept, but documented for what it is — a complement for results published without the courses' length,
  climb and controls (a PDF, liveresultat, WinSplits, O'Live…), useless beside the timing software's IOF XML, never times or places: the
  guide's « Après la course » and the ribbon's tooltip say so). Review after the race: routes taken from the published
  analysis's shared traces (`routes.js`; `meta.published.analysis` set by the publication). Documentation tab « Le tracé ».
  **Beta** (owner, 2026-10-16): see « Beta notices » below; the Tracer's notice says it is not yet advised for real competitions,
  fine for training maps.
  **French wording** (owner, 2026-10-15): « le tracé » (des circuits), never « le Tracer » — « Tracer » is the menu's verb, as
  « Déposer »; « la page « Tracer » » when the page is meant.
  « Analyse solo » ↗ passes its files' IndexedDB key and `play=1` (`fullwin.setTabParams`): the new tab goes on with the playback. Files read back there (or after a reload) keep the race, circuit and runner of the address: no new match from the trace (`take`'s `remember`), and a runner is looked for in the address's document first (owner, 2026-10-18: a runner chosen by hand was replaced by the matched one, whose calibration was not the one kept, and the tab stopped at the calibration).
  **Third pass (owner, 2026-10-15: « fix the small gaps, then the big ones »): OCAD and Mapper.** `tracer/vmap/` ports Purple
  Pen's MapModel (BSD): `ocad.js` reads OCAD 6-12 and 2018, `oom.js` OpenOrienteering Mapper (.omap/.xmap), into `map.js` (colours
  bottom to top, drawn one colour at a time; `draw(g, rect, { begin, end, overprint })` draws part of the colour table), `symdefs.js`
  (point/line/area/text/rectangle symbols, OCAD's « Bizzarro » dash metric, Mapper's Euclidean one), `sympath.js`, `geom.js`
  (.NET matrices, prepend order), `target.js` (canvas: strokes batched per colour, pattern tiles, 1 px minimum lines; PDF: vector
  operators, text through `pdf.makeFonts`). Checked against Purple Pen's reference renderings (scratch harness
  `site/data/_trtest/vmaptest.js`, git-ignored, with Purple Pen's test maps in `_trtest/ocad/`): most symbol tests ≤ 2 % of
  pixels, real maps 3-14 % (anti-aliased against GDI's aliasing), templates (other files a map refers to) not drawn. `mapsrc.openVector`:
  kind "vector", the frame 2 mm around what the map draws (`ox`, `oy` its corner in the file's mm, kept in `ev.map` with kind "ocad":
  the event reopens in the same frame), a base image ≤ 12 px/mm, sharp renders when zoomed (`renderRegion` with parts). `appear.js`:
  Purple Pen's course appearance against the map — the purple is the event's, else the map's (`FindPurple`), « layer » mode
  (`blend` "layer", `lowerPurpleLayer`, default `FindBestLowerPurpleLayer`: the lower purple — circles, legs, out-of-bounds — between the
  map's colours, the rest over the whole map, opaque) on screen, images and PDFs, `ocadOverprint` (colours flagged overprint drawn
  darkened). .ppen and IOF XML keep the OCAD file's own mm (`M.fileOffset`, `shiftToFile`; import with the OCAD map: no calage; round
  trip exact). Georeferencing from the file (`vmap/georef.js`): OCAD's grid ids → proj4 from Purple Pen's MapProjection table,
  Mapper's EPSG/UTM/PROJ.4, common EPSG codes (`site/assets/tracer/crs.json`, built by the scratch `gen_crs.py`), proj4js 2.12.1
  (vendored); numbers that can only be Lambert 93 without a grid. « Fichiers OCAD ou Mapper des circuits » (`coursefiles.js`,
  `vmap/ocadwrite.js` OCAD 9-12/2018, `vmap/oomwrite.js`; Purple Pen's Create OCAD Files): each course's drawing items as 7xx
  symbols (line, area with hatching, text with its white frame) in the course colours (Purple 11, Lower purple 12, 50 % 13, Black
  0, White 44), the map as template (the OCAD/Mapper file at offset 0, the image, a PDF as a PNG), the map's real-world
  coordinates; checked by reading back with our readers (all versions, every object; drawings equal to 1 px). **Icons and guide**
  (owner, 2026-10-16: the guide leaned on Purple Pen, as if one had to know it first): `tracer/icons.js` holds every icon (24 × 24
  line drawings) and the menus' structure (`MENUS`, `ACT_ICON`), used by the editor's menus, its right-click and special-objects
  menus, and by the Documentation's « Le tracé », now a guide of its own (13 chapters: starting, the map, the screen — a drawn,
  numbered diagram —, tools and controls, courses, descriptions, special objects, printing, checks, teamwork and the field, after
  the race, every menu entry, the calculations); Purple Pen is credited once, and named only for its .ppen files. Controls, finish,
  start, crossing points, the map issue point and point specials are **point symbols** (`coursefiles.pointOf`: circles and dot
  for controls and the finish, a map exchange's triangle turning the symbol; the others' drawing turned back by their
  orientation), a circle's gaps in the object (OCAD: angle pairs after the point, unshifted, 0.1°; Mapper has none: a line
  symbol « code.1 » and the arcs, as Purple Pen). Images placed on the map: OCAD 11+ layout images kept in the file (parameter
  27 with « F » = base 64), else files beside the course files as templates (OCAD 9-10: a PNG made a GIF; Mapper: in front of
  the map).
- **The Tracer's ribbon** (owner, 2026-10-17, after the ribbon study, private artifact
  https://claude.ai/artifact/Hgd25Hv125DLJohzSyyoqQ; **its only interface since 2026-10-24**: the « Purple Pen mode » — the menus
  and the tool bar — was retired with the Condes study's decision, `MENUS`, `E.ui`/`E.setUi`, `.tr-ui-*` and the guide's « Le mode
  Purple Pen » gone; an old `ocn.tr.prefs` `ui: "pp"` is ignored). The ribbon is data, `tracer/ribbon-data.js` (`TABS`: Fichier, Tracer, Circuits,
  Carte, Vérifier, Imprimer, Équipe et course; `CONTEXT`: Poste, Interposte, Objet, Tracé en cours, by the selection; `BACKSTAGE`: the
  « Fichier » menu's sections — **a menu since 2026-11-07** (owner: Cartographier's plain menu felt cleaner than the Office-like page):
  `ribbon.js` `openFileMenu` (Nouveau, Ouvrir…, Importer…, the saves, Exporter…, Partager…, Hors ligne, Informations…, Options…),
  its lists in a dialog of cards (`dialogs.js` `chooser`: icon, name, file extension `EXT`, what it is for; grouped by purpose; a
  search over the formats; the last choice first, `localStorage ocn.tr.pick.<key>`), « Informations » and « Options » in
  `dialogs.fileDialog`; Cartographier's « Fichier › Exporter… » uses the same dialog (`editor.js` `EXPORTS`, texts `map.exp.*`); `INFO`: what its settings and figures are; `where(act)`: a command's place in the interface in use, which the
  messages naming a command use), drawn by `tracer/ribbon.js` (`mountRibbon`; `E.ribbon.update()` after each refresh, tool change and
  drawing step). Every button runs the editor's own action (`dialogs.action`) or tool; the ribbon's own acts: `pdf-course` (the PDF of
  the course in hand with the last choices, `pdf.coursesDialog({ only })`; also the quick-access printer), `special-more`, `route-draw`,
  `finish-draw` / `cancel-draw` (`E.cancelPending`), `route-draw`, `overprint` — these in `dialogs.action` too —, `ribbon-full|line|folded|auto`,
  and the commands that need a point (`PICK`: « Ajouter un coude », « Couper le cercle »…, `E.pickOnce`, which the canvas now
  gives every click). **What applies to the selection** is one module, `tracer/context.js` (`ctxKind`, `applies`, `menuItems`): the
  contextual tabs and the **right-click menu** (`actions.contextMenu`) are both drawn from `CONTEXT`, the menu group by group and worded for
  the spot clicked (« Ajouter un coude ici », « Retirer ce coude » only over a bend's handle). A greyed button says
  why (`why()`: no event, read-only, no course, not a vector map, before the race day for the after-race ones); contextual commands that do
  not apply to the selection are left out (`applies()`). A contextual tab opens by itself when the object is chosen with Sélection from
  « Tracer » (not when just placed by a tool), else it waits and pulses; it goes when the selection does. In place: fields (description
  standard, language, map standard, print scale, circle/line/number sizes, intensity, a control's code — `A.changeCode`), choices with a
  preview (the purple's blend, a leg's flagging), a gallery of 8 special objects. Live figures: « Vérifier » counts the event audit's
  findings (`reports.audit`, 0.5 s after a change, `issueRows`: red for problems, amber for reminders only such as a climb not filled in)
  and lists the first three; « Équipe et course » counts open comments (`E.commentsData`, read once at opening). Tooltips: what it does,
  its key, why it is greyed, « Niveau avancé » for the advanced level's, F1 for the guide's chapter. Search (Alt+Q) over every command
  and the « Fichier » page: Entrée runs it and flashes its button. Key hints (Alt alone: tab letters, then button letters).
  Display (`ocn.tr.prefs` `ribbon` in the page, `ribbonFw` in full window; unset = automatic: tabs only in full window, one line under
  800 px of window height, else full): full, one line (labels dropped when too long), tabs only (Ctrl+F1, opens over the map); groups fold
  from the right into one button when the width is short; one line on a phone. **Keyboard**: one Tab stop for the tabs and one for the
  ribbon (roving `tabIndex`), ← → through tabs (each shown) and buttons, ↓ from a tab into its ribbon, ↑ within a pile or back to the
  tabs, Début / Fin. **Quick-access bar** (`QAT_DEFAULT`, owner 2026-10-17: « guess which buttons are used most »: undo, redo, the PDF of
  the course in hand, the event audit, the course's properties; `ocn.tr.prefs` `qat`, keys an action, `tool:<tool>`, `undo`, `redo`): its
  ▾ ticks `QAT_CHOICES`, a right-click on any ribbon button adds it, one in the bar removes it, Fichier › Options resets it. **Dialogs
  remember** their last choices (`dialogs.modal` `remember`: the exports — course and description PDFs, images, OCAD/Mapper files, the
  O'CN file —; `ocn.tr.prefs` `dialogs`, the courses ticked `c<id>`, files and passwords not kept). « Papier » in Circuits › Impression
  (paper × portrait / landscape / « selon le circuit », on the course's or part's print area). The left pane's object details give way to
  the contextual tab (`#tr-info` hidden while something is chosen). The guide (« Le tracé »): « L'écran » drawn with the ribbon, « Le
  ruban » (every tab, group and command from the data, the advanced level's groups tagged), « Le niveau avancé », and every
  « Menu › Commande » of its text as the ribbon's place (`W(act)` = `ribbonAt`). The home page's « Tracé » slide was taken again with the
  ribbon (`reel-tracer.webp`, same local demonstration event, scratch `shot_tracer2.mjs`: the beta notice acknowledged and the ribbon set
  in the headless profile, the left pane widened to 470 px so that the map fills the width with the whole course in view).
- **The Tracer's advanced level** (owner, 2026-10-24, after the Condes study, private artifact
  https://claude.ai/artifact/MfUEJDFRoYi1J4TYTa2FcV — 33 gaps against Condes, the plan decided): one tool at two levels. The
  **essential** level — what a .ppen holds and Ozimut's own tools — for everyone, unchanged; the **advanced** level — every Condes gap —
  **every account's since 2026-11-08** (owner: « make all features available to all »; the administrators' only from 2026-10-24;
  `E.pro` = true in editor.js, the IOF XML import and the OCAD course file's classes in `pages/tracer.js` no longer gated; the
  orange dots and the « Niveau avancé » blocks stay as the level's mark; what follows says « administrators » for that time,
  read « everyone » now). `ribbon-data.js`: an item, group or tab marked
  `pro: true`; `PRO` = the acts and tools whose every place is pro (plus `special:<kind>` of `PRO_SPECIALS`), `isPro`; ribbon.js
  draws them for `E.pro` only (tabs, groups, the quick-access bar, the search, the « Fichier » page), context.js the right-click menu,
  `dialogs.action` refuses them to others (`trc.dlg.proOnly`); their buttons carry an orange dot (`[data-pro]`); dialogs show an
  « Niveau avancé » block of fields (`.tr-pro-h`) to `E.pro` only. An event using the advanced level opens, draws and prints for its
  whole team; only administrators change those parts. **The model** is version 2 (`model.js` VERSION, nothing to convert): diamond
  (phi) loops (`cc.phi`, `cc.phiMid`: the exit's first passage, whose `next` starts the way back, its last `next` 0 — `phiBack`,
  `phiReturns`, `addPhi`; variations AB/BA; relay.js counts them as a loop of two), random-order controls (`cc.rnd`, `randomSections`:
  no leg lines, a line in the descriptions in the event's language), course `form` ("string" | "trail") and `legLines`, `discipline`
  (course, else `ev.discipline`: "mtbo" lengths along routes, "ski" a centre dot), `lengthBy`, `rogaine`, `allControls`, `partMaps`;
  finish `atStart`; `ev.classes` (name, course, est → `secondary` and `load` by `syncDerived`, run by every `E.change`); control
  `units`, `locked`, `trail` { flags, answer }, `dual` (a second symbol per box); `ev.symbols` (SVG-made symbols, ids `x:<n>`,
  symbols.js `setCustomSymbols`); leg `alts` (other routes; `legLengthFor`); `ev.relayTeams` (imported, written back by the IOF
  export); course `relay.strategy`, `couple`, `table`; `ev.maps` (other maps: { name, map, tf (event mm → its sheet mm), template,
  hidden }); `ev.mapHidden`; `ev.fieldStates`; `ev.date`, `ev.dateInHeader`; specials `mtbo-*`, `inset` (src, factor), `mask`
  (holes). **.ppen is lossy**: `ppen.js` `ppenLosses` (listed before the export) and `ppenFlatten` (diamonds become forks, the rest
  left out); the .ozmt keeps everything, other maps as `maps/<n>/<file>`. **Modules**: `iofin.js` (IOF XML CourseData 3.0/2.0.3,
  ClassList, OCAD course-setting strings from `vmap/ocad.js` `map.courseSetting` — see « OCAD course files » below; the start screen
  imports an IOF XML with its map), `classes.js`, `mysymbols.js` (SVG →
  Purple Pen's symbol strokes), `advview.js` (attack angles, close controls), `layoutx.js` (insets, mask holes), `printx.js`
  (imposition, backs, registration marks, ISO 32000 geospatial pages), `exportx.js` (GeoTIFF, SVG, KMZ with the map, MapRun, OCAD
  text, IOF 2.0.3 by variation, the Livelox package), `maps.js` (other maps: storage `tracer/<id>/maps/<n>` — API `maps/<n>`
  GET/PUT/DELETE —, placing by georeferencing, same frame or two points; editor and PDF drawing), `mapview.js` (hidden colours —
  `vmap/map.js` `draw({ hide })`, `mapsrc` `setHidden`, `appear.syncMap` — and OCAD templates from `map.templates`, string type 8).
  MTB-O's symbols are drawn after ISMTBOM 2022's descriptions (omapwiki refuses robots, the French PDF link is dead): **their sizes
  are to be checked**. Climb outside France: `trace/terrain.js` `tileHeights` (advanced level only; IGN unchanged for everyone).
  **Not built**: Condes's .wcd (closed format, needs Condes and sample files), a direct Livelox upload (needs Livelox's agreement:
  the package stands in), more interface languages (with the site's), EPS and IOF XML 1.0. Local tests: launch configs
  `pages-dev-tracer` (8781, the test account an administrator) and `pages-dev-tracer-user` (8782, not; wrangler 4.156.2); the guide's chapter « Le niveau
  avancé » (`?onglet=tracer&voir=avance`).
- **Training maps in the Tracer** (owner, 2026-11-05, after the OCAD study, private artifact
  https://claude.ai/artifact/GNEXysSHwavEj636KdgQDU; the advanced level for a day, **every account's since 2026-11-06**, owner: the
  group « training » no longer `pro`, its guide text in « La carte »'s « Cartes d'entraînement »): ribbon Carte › « Carte
  d'entraînement ». **« Filtrer la carte… »** (act `map-colors`, `mapview.colorsDialog`, OCAD/Mapper maps only) hides colours **and
  symbols**, for every course (`ev.mapHidden` colour ids, `ev.mapHiddenSyms` symbol ids) or for one (`course.mapHide { colors,
  symbols }`; « Comme tous les circuits » drops it) — `model.mapHideFor(ev, course)`; ready-made choices (`presetSymbols`, by
  ISOM/ISSprOM numbers, never 6xx-9xx nor unnumbered symbols: the map's margins): « Sans chemins » (line symbols 501-508, ISOM 2000
  501-509), « Sans végétation » (4xx), « Relief seul » (hides 2xx-5xx), « Courbes seules » (keeps 101-103, ISOM 2000 101-105: its
  104/105 are slope lines and values, ISOM 2017's earth bank and wall). `vmap/map.js draw({ hideSyms })` leaves those symdefs out
  (never the layout's); `mapsrc` `renderRegion(…, hide)` / `drawPdf(…, hide)` take a course's choice, `setHidden(colours, symbols)`
  the screen's (`appear.syncMap(ev, map, course)`, the editor passing `E.cd.course`, also on a change of course); PDFs (`pdf.js
  onePage`), course images (`paintCourse`'s `course`) and the SVG export draw each course's own. **« Couloir et fenêtres… »** (act
  `exercise`, needs a course): `tracer/exercise.js` makes the course's mask (`layoutx`'s « mask », shown on that course only, `gen
  { course, width, window (metres), keep, sig }`): white over the map frame but the union of capsules along the legs (with their
  bends) ± half the width, discs round the controls (a score course: windows only) and the map's layout images (`logosOf`: logos
  never hidden), traced by marching squares on a grid of 3 M cells at most (≥ 0.1 mm) and simplified, filled even-odd (an island
  inside a loop stays white); `model.syncDerived` → `syncExercises` traces it again when its signature changes (a control moved, a
  bend) and drops it with its course. Masks are laid out before the other specials (`layout.js`), so texts and images stay over
  them. Defaults 80 m forest, 30 m at 1:5000 or larger. A .ppen keeps none of it (`ppenLosses` « mapfilter »). Tested 2026-11-05 on
  the local « ent opa 8 nov26 deski P » event (OCAD 2018): « Courbes seules » on one course, the whole map on the others, a 60 m
  corridor on another, both on screen and in the PDF (vector); the geometry in Node (a 4-leg loop: corridor and island in 52 ms).
  Not done: image, scan or PDF maps (masks only; filtering them would mean repainting pixels). The mask it makes is a « mask » special,
  which anyone may also draw by hand (`PRO_SPECIALS`, the advanced level, everyone's since 2026-11-08); everyone removes it with the dialog's « Retirer le masque ».
- **« Tournée des postes » / Control tour in the Tracer** (owner, 2026-11-07: « trace the optimal route through a selected list of
  controls, by default all », for the controller, and for placing and collecting controls; every account, the essential level): ribbon
  Équipe et course › Terrain › « Tournée des postes » (act `tour`, `tracer/tour.js`). A dialog: the controls (all normal controls ticked;
  Tous / Aucun / « Les postes d'un circuit… » selects one course's, all branches), « Partir de » (a start, a finish, any control, or the
  best-placed control) and « Finir à » (back to the starting point, any control, a start/finish/control), the pace (min/km in ordinary
  forest on the flat; 10 forest, 8 sprint) and the minutes at each control (2), the last two kept in `localStorage ocn.tr.tour`. The
  computation reuses the analyses' route engine in its worker (`routeplan.planner`): a frame round the points (300 m or 15 % margin, 1.5 m a
  pixel, 4 Mpx at most), an OCAD/Mapper map by its symbols (`vectorroutes.layers`), any other by its colours (a PDF rendered at the frame's
  resolution), the setter's out-of-bounds areas / dangerous areas and boundaries closed whatever course shows them (worker op `forbid`,
  `routechoice.forbidCells`, kept over a new reading), the heights from `terrain.loadGrid` when the event is georeferenced (flat otherwise,
  said). Then: the costs from each control to its 8 nearest (worker op `tour`, `routechoice.costsFrom`: one Dijkstra a control over the whole
  grid stopped once they are reached, its inner loop allocation-free — 7× faster than through `step`), the order by `tracer/tsp.js` (an
  asymmetric TSP: exact Held-Karp up to 13 nodes, a dummy node for open or free ends; else nearest-neighbour starts, Or-opt and 2-opt with the
  reversed stretch costed, double-bridge kicks for 0.2-3 s; checked against brute force on 360 small cases), a leg of the order only estimated
  (straight line × the median cost a metre × 1.5) computed exactly (worker op `path`, `routechoice.bestPath`: A* in an ellipse, else the
  whole grid, tightened) and the order searched again until every leg is real; each leg's route by `bestPath`. Optimised on the engine's cost
  (with the caution), times shown without it × the pace, plus the stops. Shown in a panel over the map's top right (`.tr-tour`: the summary,
  each row the visit's number, control, distance, climb, time, cumulated clock; hover lights the leg, a click frames it in the part the panel
  leaves free; fold, ✕/Échap) and drawn over the map (`E.overlays` key « tour »: cased blue lines, an arrow mid-leg, numbered visits, a leg
  with no way found dashed and flagged ⚠); kept for the visit only (`E.tour`), never in the event. Exports: GPX (numbered waypoints + the
  track; with a georeference), PNG (`exports.courseImage` of all controls at 250 dpi with the tour drawn and a title), CSV. `E.fitBox` added to
  the editor. Measured 2026-11-07 on the local « ent opa 8 nov26 deski P » (OCAD 2018, Lambert 93, 32 controls + start/finish): 6.4 km,
  71 m climb, 2 h 13 at 10 min/km + 2 min a control, in ~9 s (costs 3.8 s, routes 3 s, IGN heights 0.7 s); « Sample Event » (JPEG, no
  georeference) White's 7 controls with free ends in ~2 s, along its paths. Guide: « Le tracé › En équipe et sur le terrain »'s box. **« Créer le circuit »** (owner, the same day: « a specific circuit for it, with
  control card accordingly »): the panel makes the tour a course of the event (`makeCourse`, one change, undone as any other): its controls
  in the tour's order — the start when it leaves from one, the finish when it ends at one; back to its start, the finish within 100 m of it
  if any, else it ends at the last control; back to a control, that control again —, named « Tournée des postes » (« 2 », « 3 »… when
  taken), a test course (`hideFromReports`: out of the reports; the IOF export still takes it, the toast says to remove it before sending
  the courses to the timing software), its length and climb the tour's (climb unknown without relief), its print area automatic. The panel
  then shows it, prints its course map (`pdf.coursesDialog({ only })`), description sheet (`descriptionsDialog({ only })`, new option) and
  punch card (`punchDialog({ only })`, new option: a hidden course included); a course undone or deleted brings « Créer le circuit » back.
  Its legs are drawn straight like any course's (the tour's routes stay the overlay's). Guide: « Le tracé › En équipe et sur le terrain »'s
  box and paragraph. Not done: several collectors sharing the controls, the tour in the field mode, the tour saved with the event.
- **Printing for a print shop: one engine for both tools** (owner, 2026-11-12: « Cartographier has separations, yet maps are printed
  with their courses from the Tracer »): `tracer/vmap/inks.js` — OCAD's spot inks read (`readInks`, `attachInks`: `map.spots` and each
  colour's `spot` on every OCAD 9+ map the Tracer opens; Cartographier's `spotsFromParams` calls it; Mapper files' spot colours are read
  by neither), the plates (`plates`: each shown ink some colour uses, then C, M, Y, K for the colours without inks — OCAD's mix —, or
  process C, M, Y, K), and two painters `PdfTarget` takes (`painter`): `spotPainter` (« Separation » / « DeviceN » spaces made once a
  document, « All » for registration, real overprint `OP`/`op`/`OPM 1` by `overprintGs`) and `platePainter` (grey at the plate's share,
  white where a colour the plate does not print lies over what it already holds, nothing where it overprints — the plates are right
  whatever the viewer does with overprint; a logo separated by its pixels onto the process plates, else the darkest ink's). The Tracer's
  « PDF des circuits »: « Couleurs » › « Encres d'accompagnement (imprimerie) » — the map's inks, the course's purple an ink of its own
  named in « Encre du violet » (the map's purple's ink by default; a map ink's name prints the purple with it), the course's black in the
  map's black ink, the purple overprinting in « blend » mode, opaque in « layer » mode — and, under the advanced level, « Séparations »
  (one page per ink or per CMYK ink, each with registration marks — `printx.registrationMarks`' `painter` — and « Plaque <ink> » in its
  top margin; one course per page only; an image or PDF map cannot be separated: the course alone then). Before, the Tracer wrote CMYK
  with the map's overprint imitated by a Darken blend (kept for printers: CMYK and RGB unchanged). Tested 2026-11-12 on the Desquinemarre
  map (`deski 8 nov 26 F.ocd`, 7 inks: 52 of 83 colours, one DeviceN) — `tools/mapper/t_inks.mjs` — and in the browser (the Tracer's
  « long 21p » in spot inks and as 11 plates, the purple plate the course alone; Cartographier's plates unchanged). **Not yet seen by a
  print shop**, nor through a RIP or Ghostscript's `tiffsep` (not on the PC).
- **OCAD course files in the Tracer** (owner, 2026-11-04: « why can't an OCAD file be imported alone? »; every account, the essential
  level): an `.ocd` holding courses (OCAD's course-setting project) is an event file of its own on « Importer un événement », and on the
  start screen or « Nouvel événement » it goes to the import (`pages/tracer.js` `ocadCourses`); its map is the file itself when it holds
  map objects (`map.mapObjects`: objects outside 700-799), else the OCAD/Mapper template OCAD shows under the courses (`map.templates`),
  which the dialog asks for by name (a PDF or image of it: aligned in two clicks). Both files share the OCAD frame: the controls keep
  their file mm (`iofin.importInto` `fileMm: false`, then `transformAll(-ox, -oy)` as for an IOF XML). **What OCAD 12+ writes**
  (checked on an OCAD 2018 file, `C:\kerkia\Ozimut\work\Test files\ent opa 8 nov26 deski P.ocd` on `deski 8 nov 26 F.ocd`): no type-1
  parameter strings; each control is an object of view type 1 and object-string type 1 whose own string is « <sort key> → Y<kind> →
  a<code> → c/d/e/f/g/h<symbol> » (`ocad.js` collects them in `ctx.csObjs`, and never draws view types 1-4: the Tracer draws the
  courses); « Yd » is the description sheet's box. **Description symbols** (`iofin.ocadSymbol`): ISCD 2018 numbers with three
  decimals (« 1.013 » = 1.13), a direction as three more digits (« 12.306 » = 12.3 + direction 6), the directions counter-clockwise,
  cardinals first — N, W, S, E, NW, SW, SE, NE — read against the map (0.102 the western of two pits, 0.208 the north-eastern of three
  boulders, 12.306 a depression's SW part; OCAD's documentation says nothing); ISCD numbers turned into Purple Pen's ids
  (`FROM_ISCD`, the inverse of `iscd.js` `RENUMBER`). A course ending at its start (« s S2 » again) gets a finish there. **Logos**
  (owner, 2026-11-04: « logos are never removed from any display of the map »): a course file's layout images (the test file's 5
  JPEG logos) become image objects on every course where OCAD shows them (`iofin.layoutPictures` / `placeLayoutImages`, also from the
  editor's « Importer des circuits », not twice at the same place; none when the course file is the map: drawn with it). Not done:
  variations keep their first branch only (listed in the dialog; none in the test file), OCAD's circle gaps are left out (classes,
  the advanced level's, for everyone since 2026-11-08), a single file holding both map and courses not met yet.
  **A courses file holds its own map only with 50 objects or more outside the 7xx symbols** (`vmap/ocad.js holdsMap`, used by
  `circuits.readCourseFiles` and the Tracer's `ocadCourses`; owner, 2026-11-11: « nuit SO P.ocd » had two stray objects, was taken as
  its own map, and the analysis's circuits came out as white sheets with the overprint, the background map dropped beside it
  ignored): another OCAD/Mapper file dropped with more map objects is the map (the template's by name, else the fullest), else
  « needMap » (`sh.ocad.err.needMapAny` when no template is named). **No circuit of a map analysis is saved on a nearly blank map**
  (`shared.js nearlyBlank`: under 3 % of pixels neither paper nor purple, read at 1600 px; the blank circuits measured 0.3-0.7 %,
  the Desquinemarre map 19-24 %): the OCAD import checks its first circuit, the circuit editor a new map (`sh.ocad.err.blank`,
  `sh.e.blankMap`).
- **Analyse multi, the owner's review of 2026-11-04** (`pages/shared.js`): the left panel opens on its first tab, « Circuits »
  (`sh.tab.circuits`): the circuit is a drop-down at its top (each with its number of tracks; no chips by the title), the runners'
  list names its columns (Voir, Coureur, Suivre, Temps) instead of a sentence. **First visit**: an account allowed to add a track
  (not a visitor; the organisers' `upload` switch) with none in the analysis is offered to drop it (`offerTrack`, once per analysis
  and browser, `localStorage ocn.sh.offered.<id>`; after the beta notice); **the circuit is found from the track**
  (`matchCircuits`: the controls passed in the circuit's order, `coursePasses`; `sureCircuit`: the only one at 90 %, the longest of
  several at 95 %, the best at 60 % with 20 points over the next — else the runner chooses), then the usual consent. « Ajouter ma
  trace » (the top line) and « Ajouter des traces de test… » (the bottom of « Circuits » only since 2026-11-05) find the circuit the same way (test tracks had all gone to
  the circuit shown, whose analyses then came out empty). « Itinéraires » computes when opened, and with the whole course shown every
  leg in turn, listed below (`rcmOne`, `rcmTurnOn`). **Two views** in the top line, « Carte » and « Analyse des temps » (« Temps intermédiaires » until 2026-11-05; the switch in the flag's pale orange, the line beside it only the event's date and type — « Entraînement club » or « Compétition » —, no organiser nor « vous organisez »; at the line's right end, over the settings, who may open it, `sh.access.*`: « Accès : tous les comptes », « … visiteurs sans compte compris », « Accès restreint : membres du club » / « : mot de passe »)
  (`?vue=temps`): the second is Arena's split analysis (`splits.js` `renderEmbedded`: no head, nothing written into the address, its
  views' tabs kept in the page) fed with a document built from the tracks (`splitsDoc`: one class per circuit, each track's passes,
  its place among those who passed every control and finished, its start's Paris clock time); the map tab keeps « Analyses »' own
  split table and gaps, linked to the map. **The split times keep the map's three panels** (owner, 2026-11-05: switching to them felt
  like another page, the menu moving): `an-theatre` stays on, `#sh-sp-layout` lays out « Circuits » on the left (the circuit and the
  runners, ticked = shown in every view, the table too: `renderEmbedded`'s `slots`, `side` in splits.js, whose charts then drop
  their runner chooser and the hint's « choose the runners under the chart » clause), the views in the middle, « Réglages » (the
  view's settings) on the right; the panels' widths shared with the map's prefs; a circuit chosen there is the map's on return
  (`onClass`). The « Circuits » tab has no « Circuit » label and no « n tracks shown of m » line; adding one's track is the top
  line's « Ajouter ma trace » / « Remplacer ma trace » alone (owner, 2026-11-05, second rule: not in « Circuits » too), a small window
  offering « depuis l'ordinateur » / « depuis le téléphone » (none on a phone), the FIT tip and « Annuler » (`addDialog`; the consent
  then in « Circuits », shown); no « ← Analyse de
  carte » in the top line (the menu leads there). **New traces** (owner, 2026-11-08): while the page is open and its
  browser tab in front, it asks `GET /api/analyses/<id>?poll=1` (the traces' list alone, no visit counted; visitors' `/v/<id>`
  too) every minute; a change is never drawn in under the reader's eyes — a notice at the window's bottom (« 1 nouvelle trace » /
  « Des traces ont changé », `.sh-fresh`) offers « Actualiser », which reopens the replay from the address's state (time, leg…),
  the new runners shown. **The leg shown** (owner, 2026-11-08), in both analyses: a menu at the control bar's left
  (`sidepanel.legPickHtml` / `bindLegPick`: the course icon, the leg's « 3 → 4 » when one is open, « Tout le parcours » then
  each leg), drawn again on every change of leg, so it, « Inter-postes » and ⏮ ⏭ always agree; in Solo ⏮ ⏭ from the whole
  course open the leg run now / the next (they only moved the time), as the map analysis's open a leg; « Aide » has it. **A leg opened, however** (owner, 2026-11-08: « the full leg in view, the full
  trace of the selected runners shown right away »): framed with its two control circles whole (`fitLeg`, Solo's `zoomTo` with
  `circleR`, the last leg too), each shown runner's route on it drawn whole at once, the dot moving along it (the tail and « Trace
  à venir » ignored there; the 3D view's style `future: "whole"`), refitted while the bar settles; back on the whole course its view,
  time and stillness as left (`wholeWas`), the display's settings applying again — a start mode changed starts afresh. The keyboard's ← → step the legs while one is open, ↓ ↑ too as in
  « Inter-postes »' list (↓ the next; owner, 2026-11-08 and 2026-11-10; `sidepanel.legArrows`: not from a field, slider, menu or dialog, nor with a modifier; the map analysis's only
  while its map is shown). **The graph under the map** (owner, 2026-11-08): « Affichage › Graphique » chooses what
  the strip draws — the pace by default, or a measure of the Trace menu (Solo: the file's channels, slope, corrected pace; the
  map analysis: corrected pace, altitude, slope from the terrain) —, its bar named after it (`pacestrip.graphName`; prefs
  `graph`); `drawPaceStrip`'s `by` / `unit`. The « Allure » bar's figures end with « ↑ » the climb so far (`track.cumClimb`). Each circuit's length follows its name in the selector and stands at the map's top left (`courseLenText`:
  the published class's length and climb, else control to control from the georeference).
- **Logos on OCAD maps, everywhere** (owner, 2026-11-04): an OCAD map's layout images (`vmap/map.js` `LayerBitmap`) are sized from
  their file's header when read (`ocad.js` `imageSize`: the map's extent holds them from the start), `map.ready` settles once all are
  decoded and `mapsrc.openVector` waits for it before drawing (they could miss the base image before); the layout is drawn whatever
  OCAD's view setting « hide layout » says (`map.hideLayout` read, not used); PDFs print them (`PdfTarget.image`: PNG/JPEG embedded
  as they are, BMP/GIF as a PNG — before, « layout bitmaps are not printed »). Templates (other files a map refers to) are still not
  drawn: a logo kept outside the .ocd cannot be shown.
- **Beta notices** (`beta.js`; owner, 2026-10-16; Orga's « Résultats » and « Horaires » marked « bêta » on 2026-11-07, owner — the
  menu's mark, the title's label and a note, `results` / `starts`, no notice to acknowledge; the map analyses — runners' and organisers' pages — out of beta since 2026-11-05, owner: no notice, tag or menu mark; `beta.js` keeps the entry unused): the tools just made and little tested — « Tracer », « Analyse multi » (the runners'
  and the organisers' pages, one notice for all) and « Organisation › Direct » — open with a notice to acknowledge (`betaNotice(tool)`:
  just made, little tested, a beta to try and to report on; Tracer: not yet for real competitions, fine for training maps; Analyse
  multi: errors may remain in calibrations, traces and times; Direct: not yet alone for a competition's live results, try it at a
  training or beside the usual live), once per browser and tool (`localStorage` `ocn.tr.beta`, `ocn.beta.multi`, `ocn.beta.direct`;
  bump a notice's `v` to show it again; Escape closes it unacknowledged), its links to « Nous écrire » (a bug report, subject
  « Tracé : », « Analyse multi : »… read by `contact.js` from `?sujet=`) and to the guide counting as acknowledged. A « Bêta » label
  (`betaTag`) on the page titles and the editors' top bars, a note under the head (`betaNote`), a small « bêta » after their names
  in the menus (`app.BETA_ROUTES`: lean pages have no title), and a callout in the Tracer's guide.
- **Full window** (`fullwin.js`; owner, 2026-10-15: room for the map, no stacked menus; one way for the analyses and the
  Tracer, the analyses'): the analyses' playback (« Analyse solo » transport row, « Analyse multi » right panel) and the
  Tracer's top bar have « ⤢ » (`body.full-win`: the site's bar and footer hidden, the layout
  refits on the resize event; Échap or « ⤡ » back; **the browser's own full screen too** since 2026-11-12, owner: its bars and tabs
  gone as in Virtually — `screenFull`, asked on the click, Échap kept for the page by Chromium's keyboard lock, the browser's own
  exit leaving full window with it (`fullscreenchange`); a « ↗ » tab, opened without a gesture, keeps the browser's bars) and « ↗ » (the same page alone in a new tab, `?fen=1`, kept by
  `app.replaceQuery`; opened by script without noopener, so « Analyse solo » finds its session's files). In full window the
  button is « ⤡ » « Revenir au menu (Échap) » everywhere, a `?fen=1` tab included (owner, 2026-10-15: its former « ✕ Fermer
  cet onglet » did not close it - a browser refuses to close a tab reloaded or not opened by script). Full window always has a
  way back (owner, 2026-10-17): while it is on, `fullwin.guard` shows a fixed « ⤡ Revenir au menu » (`#fw-guard`) whenever the page
  shows no « ⤡ » of its own (checked every 0.7 s; « Analyse solo »'s calibration step has none). Playback speeds × 1, 2,
  5, 10, 20, then every × 20 up to × 100 (owner, 2026-10-15; `SPEEDS` in `analysis.js` and `shared.js`).
- **Analyse solo / multi** (owner, 2026-10-14; « Analyse multi » = the former « Analyse club » and « Analyse compétition »,
  2026-10-15): « Analyse
  solo » (« Analyse perso » until 2026-10-15) exists twice — in « Courses » (`#/analyse`, route `analysis`, a race of « Résultats » chosen) and in « Entrainement »
  (`#/analyse-solo`, the old `#/analyse-perso` still opens it; route `analysisPerso`: the same `analysis.js` with no race — one pseudo-runner, three steps, its own
  memory `memos.perso` and IndexedDB key `files:perso`). « Analyse multi » under « Entrainement » (`#/analyse-club`,
  route `analysisClub`: training events) and under « Courses » (`#/analyse-competition`, `analysisRace`: competitions,
  tied to a race of `prov/index.json`, its circuits offered, the runners' published results beside their traces) lists
  the events their organisers have made ready (a circuit at least): the runner picks one and adds their trace — nothing
  to create there; the organisers manage them from « Organisation » (the same `pages/shared.js` in its organiser mode,
  `ORG_ROUTE`: the settings and circuits open, the replay below as the runners will see it, « Voir comme les coureurs »).
  **One's own curves** (owner, 2026-10-15: as in « Analyse solo », for oneself only): a column on the far left, folded by
  default (« Mes courbes › », kept in `ocn.sh.prefs`), the curves of `trace/curves.js` (shared with « Analyse solo »)
  over one's own race, from one's own file kept in this browser (IndexedDB `ocn-analyse`, key `own:<id>:<n>`, saved when
  one's trace is sent, dropped with it; else « Déposez votre fichier ») — the server keeps positions and times only, and
  the others never see them; the file must overlap one's shared trace in time. Both are `pages/shared.js` on `/api/analyses` (`functions/api/analyses/[[path]].js`):
  **no D1 table** — R2 (`cn-state`, binding `BUCKET`) holds `analyses-meta/<id>.json` (the analysis; its summary in the
  object's custom metadata, so the list is one R2 list), `analyses/<id>/map-<n>` (images) and
  `analyses/<id>/trace-<n>-<uid>.json` (one per account and circuit). CI never touches these prefixes (it copies only
  `uploads/`). Access: organiser and admins always; else `public` (every logged-in account), `club` (the organiser's club =
  the club of one's latest race in `site/data/r/<lic/10>.json`, read through `env.ASSETS`), or `password` (PBKDF2 as for
  accounts, checked once by `/unlock`, which returns an HMAC key of analysis + account + salt, sent as `X-Analysis-Key`;
  the browser keeps it in sessionStorage). **A club's analysis is listed to every account and may have a code** (owner,
  2026-11-07: a club's trainings have invitees from other clubs or from none): `meta.code` with the code as `pw`, opened by
  `/unlock` as a password's; a non-member gets access "club" in the list and 403 `{ error: "club", code, org, owner }` on the
  analysis, and « Analyse »'s card / the analysis page say it is the club's and invite to ask its organiser (named) for the code
  (`mapanalysis.clubAsk`; the code's field only when one is set); the organisers set it under « Publication et accès », the new
  training's form and the Tracer's publication (« et les invités qui ont le code »); a code or password no longer used is dropped
  (ticking it again asks for a new one, old keys stop working). Visitors without an account still see the public ones only.
  Each account adds, replaces or removes **only its own** trace (the server sets
  name and licence from the account); the organiser may remove any. A shared trace keeps positions and times only
  (`trace/share.js`: whole seconds and 1e-6° deltas, ~20 KB for 40 min), cropped to the map's area + 300 m, consent asked;
  account deletion removes one's traces (`api/account/delete.js`); the privacy page says so. The organiser's circuit editor
  reads the map (`trace/mapfile.js`), detects the course, georeferences from a KMZ/KML, a world file (+ .prj), an IOF XML
  with coordinates, or the organiser's own trace (alignment); the controls' order from the IOF course, else the trace's
  visiting order, else as read, and can be clicked in order (snapping to the circles); stored as an affine (lon, lat) → px
  (`geoFromFit`/`fitFromGeo`). The replay (Livelox's features, checked on its documentation): clock time, mass start, mass
  start from a chosen control, « attente aux postes »; follow all / the selected runner / no one; tail; a leg view (routes on
  one leg synchronised at its start, the left list ranked by leg time with gap, distance and pace; ⏮ ⏭ step legs); the
  splits table (leg time, rank, cumulative; « Comparer à » gives the duel's gaps; a click on a control opens its leg).
  Passes: `coursePasses` (first visit within 25 m after the previous control, its closest point; start = departure,
  finish = arrival). Tested 2026-10-14 with four local test accounts (local D1 only) and synthetic traces: access rules,
  ownership, every mode; a search around a control is timed at its first approach (published splits would be better).
  **An administrator's test traces** (owner, 2026-10-24: one account could show one runner): under the runners' list,
  « Traces de test (administrateur) » takes several GPX/TCX/FIT files at once, each a runner « <admin's name> #k » (PUT
  `{ test: k }`, uid 1e9 + account × 1000 + k, no licence, `test` in the record; labelled #k on the map, tagged « test »),
  « Retirer mes traces de test » removes them (DELETE `…/trace/<n>/tests`); account deletion removes them too. Invented tracks
  for the « Entrainement Gif » test event (scanned map, invented georeferencing, routes over the map's colours, variants and
  mistakes): `C:\kerkia\Ozimut\work\Test files\fake-tracks\gen_tracks.py`.
  **Runners shown**: a click on a name shows or hides that trace (any number; « Toutes », « Aucune », « Inverser », « La
  mienne »); the « Suivre » column (⌖) says who is followed — the list's first row « Tous les coureurs affichés » the group, a runner that runner, one always lit — and the bar's push button, a crosshair (`pan`, `PAN_ICON`, pressed in the flag's orange, its tooltip « Activer / Arrêter le suivi de la carte ») whether the map pans with them: a hand on the map or ⤢ ▭ releases it, one click resumes it (owner, 2026-11-05: who and whether apart; `followMarks`, `?p=0`); the bar holds the start mode — « Attente aux postes » by default, « Attente et pause aux postes » stopping the replay where everyone sets off from each control, « Départ en masse depuis le poste » followed by its control —, then the transport, speed and « Suivre », then the time line — over the map's column only, so that it follows the side panels, the mode an icon button opening a menu of icon and name (`MODE_ICON`), the start control's first entry « ▷ », the time line wrapping to a line of its own when the map is narrow (owner, 2026-11-05); the pace strip folds under a bar « ▾ Allure » (`setStrip`, the same as « Affichage »'s box); the top line in three parts (`.sh-top3`), the view switch in the middle, ⤢ ↗ at the right end after the access; the timeline spans the runners shown; kept for the visit (`sessionStorage ocn.an.vis.*`).
  **Display** (owner, 2026-10-14: no curves per runner here, the map is what is compared): the right panel's « Affichage »
  as on « Analyse solo » — width (4 steps), « Trace à venir » (masquée by default / estompée: each runner's route to its
  finish, faint), tail, the map's and the traces' opacity, the course overlay (« Parcours sur la carte »: off by default where the map already shows the course — owner, 2026-11-05: a circuit's `printed`, set by the Tracer's publication and the OCAD import, and by the circuit editor when most controls lie on circles read on the map; a circuit without it counts as printed in an analysis opened from the Tracer, `via`; the choice kept apart for printed maps, `courseOver`) — kept in `localStorage ocn.sh.prefs`.
  **A circuit's start and finish** are what was read on the map, or the organiser's first and last clicks (« Saisir
  l'ordre »): the editor no longer makes the first and last controls read the start and the finish (`relabel` only in
  the click mode) — that ended every race at the last control found. A circuit without its finish runs each trace to its
  end, without its start from the trace's start; a « finish » saved that way earlier only counts where the runner stops
  with under a quarter of the race left (`track.finishAfterAll`).
  **Maps are kept as long as their analysis** (owner, 2026-10-14: « forever »): the bucket has no expiry rule (only the
  default abort of unfinished multipart uploads), an organiser's account deletion keeps their analyses (owner 0, no
  name; the administrators manage them). **A stored map is never degraded** (owner, 2026-10-14; it was re-encoded as
  WebP and capped at 8000 px the same day): `mapfile.imageBlob` keeps a PNG, JPEG or WebP byte for byte, and stores a
  PDF's rendered page (4200 px at most), a GIF or a BMP as a lossless PNG; up to 80 MB a map (`MAX_MAP`, server and
  editor; Cloudflare takes 100 MB a request). R2's free 10 GB (420 MB used on 2026-10-14: the database and the site
  state) hold some 2000 phone photos of 5 MB; the administrators see the bucket's use on the list pages
  (`/api/analyses?stats=1`).
  **After 2DRerun** (study of 2026-10-23 against World of O's 2DRerun/3DRerun, from public write-ups; built 2026-10-24,
  one commit each, live GPS tracking and QuickRoute import out of scope): the routes can be **coloured by pace** (one scale for
  every runner shown, Solo's legend; `trace/pacecolour.js`, moved out of `analysis.js`), and in a leg's view by **leg time**
  (fastest to slowest) or by **variant**. Under the replay, `pages/sharedviews.js` draws five tabs: « Temps » (« Temps intermédiaires » until 2026-11-05, owner: short labels; the
  splits against « Comparer à »), « Inter-postes » (one runner's legs as Solo: time, best and rank, time lost by the split-times
  page's rule — `trace/legs.js`, moved out of `analysis.js` —, route against the straight line, pace; never heart rate: only
  positions and times are shared), « Écarts » (each runner's gap to the leader at each control, the « superman » of best legs or a
  runner, against the controls or the course's km, `charts.gapChart`; a click near a point puts the replay at that pass and follows
  the runner; « Face-à-face »: time gained/lost leg by leg, `charts.duelChart`), « Variantes » (route choices, below) and
  « Exercices » (a training's only, below). **A competition's published split times** (`trace/published.js`): the runner's row in
  the circuit's class with splits (else any), the course matched to the class's controls by codes in order, else by count; the
  trace's clock offset from the published start when it agrees with the trace's passes within 2 min, else the median shift to them
  (passes over 60 s off dropped): passes, start and finish then come from the published times, and the legs, the leader and the
  superman are taken over the whole class (« officiel » tag). **The replay's state in the address** (`replaceQuery`, written once
  the replay is still 0.4 s, 1.5 s while playing): `c`, `m`, `from`, `t`, `leg`, `show` (uids shown), `sel`, `f`, `ref`, `v` (the
  tab), `lo`, `g`/`gx`/`gm`/`da` (gaps), `ex`; `?fen=1` kept. **The pace strip** under the map (`trace/pacestrip.js`, « Allure sous
  la carte », on by default): every runner shown as a line over the replay's own time axis, smoothed, the cursor; a click or drag
  seeks. **Route choices** (`trace/routes.js`; the « Variantes » view chooses its leg in a selector, « Colorer les traces par variante » ticked by default until unticked in the visit, and a leg coloured by variant or leg time draws every route whole whatever the replay's time — owner, 2026-11-05: nothing showed at the leg's start): on a leg, each route resampled to 32 points by length, the discrete Fréchet distance,
  complete linkage under a threshold (a fifth of the straight leg, 30-120 m, a slider); variants lettered from the fastest, each with
  runners, best and median time, mean length; a hand edit (runner moved, merge, name) freezes the leg, a later trace joins the
  nearest variant within the threshold. Tags: the organiser's on the server with the circuit (shared with every runner,
  « Partager avec les coureurs »), anyone's own in `localStorage ocn.sh.var.<id>.<n>`, over the organiser's — a runner's tags need
  no right to write and change nothing for others. **Exercises** (`trace/corridor.js`, training analyses only): the organiser draws
  a corridor (a line clicked on the map, a width) on the whole course or a leg, or makes a leg a compass leg (the straight line
  between its controls); each runner's share of route inside (by distance), time outside, largest and mean deviation, and on a
  compass leg the bearing error (to halfway, positive to the right); the width recounts live — the organiser's is saved, a
  runner's is theirs for the visit. Both live in the circuit (`course.variants` {leg: {th, names, assign}}, `course.exercises`
  [{id, kind, leg, w, name, pts}]) through `PUT /api/analyses/<id>/extras/<n>` (organiser only, R2 as the rest, no D1), kept
  when the organiser edits the circuit. **A headcam video** (`pages/sharedvideo.js`, « 🎥 » in the map's tools): a local file
  (object URL, never sent) in step with one runner's race, the offset typed or set by « Caler ici »; plays at the replay's rate up
  to × 16, frame by frame beyond; runner and offset kept per analysis in `localStorage ocn.sh.video.<id>.<n>`. Tested locally
  with synthetic traces on the reel's invented map (scratch `mkmulti.mjs`, `mkrace.mjs`: four accounts, a route variant, a
  mistake loop, traces time-warped to a local race's published splits).
- **Computed route choices** (owner, 2026-10-24: « the best routes for each control, with time and climb »; a prototype,
  administrators only until 2026-11-04, **every account's since then, computing on by default** — owner: « enable computed routes for
  all, on by default »; `ocn.rc.on` "0" alone turns it off; an organiser's analysis may switch it off, `opts.routes`; before: the box « Itinéraires calculés » under « Affichage » of « Analyse solo »'s playback and of « Analyse
  multi »'s right panel, `me.admin`): `trace/routechoice.js` (pure, run in the worker `trace/routeworker.js`), `trace/routeplan.js`
  (the planner, the settings panel shared by both pages, the routes drawn, `autoPace`, `nearestRoute`). The map is read **by its
  colours only** (no vector map in the analyses): areas (white, the two yellows, three greens by depth, olive) and inks (purple,
  black, grey, brown, blue). **The reading and the search redone on 2026-11-01** (owner, on the Fougères night-champs photo: the
  routes ignored the big track the runner took; « don't use the runner's trace, don't retune the speeds »): the cause was the
  reading — the photo's grey paper read as bare rock over 88 % of the map, and the opening sized from the measured black line
  width (1 px on photos and scans) made every path a « thick » area. Now: (1) `flatten` makes the paper white (its colour = the
  median of the brightest nearly grey pixels; its level per channel the 92nd percentile of those pixels in ~50 m blocks, blocks
  without paper filled from their neighbours, smoothed; a white export left as it is); (2) `northLines` takes the magnetic north
  lines out (a Hough vote of each row's thin runs, blue — any bluish pixel: a photo's are pale — then black, within 16° of the
  vertical; three strong lines parallel within 0.4° and evenly spaced ≥ 80 m, then every line of that spacing present on a fifth
  of the rows; erased into `I_ERASED`, the cells' `north`, cyan in the picture); (3) the thickness test in metres (`THICK`: a
  half width of 3.5 m in forest, 2 m in sprint — the worker reads the map again when its kind changes); a forest map's thick grey
  lighter than 165 is shade, not rock; (4) `lineNetwork`: the thin black **or dark neutral grey** pixels (a scan's black lines) as
  pieces (3 % black at least), each one's skeleton (Zhang-Suen), ends and direction (a dash's axis, else the last 5 m), facing ends
  of different pieces joined across gaps ≤ 0.8 × the shorter piece (3-15 m; within 30° of the gap, the pieces within 45°), a chain
  of 30 m a path of one of three kinds against the map's weighted-median dashed path (`PATH`: TRACK solid and 15 % wider, or dashes
  1.3 × longer and 10 % wider; SMALL dashes under 0.6 ×; else PATH), the gaps drawn with `PATH.BRIDGE` (they open nothing
  impassable, and count as nothing in « obstacles » mode); speeds `track` 130, `path` 125, `small` 110 (vector maps: 501-504 track,
  505 path, 506-508 small). Cells of ~1.5 m: the most frequent area, the fastest path kind (`path`, and `raw` without the bridged
  gaps). **The organisers' overprint** (owner, 2026-11-01: 11 → 12 through a château's hatched grounds; `overprint`): the purple,
  and purple printed over yellow, orange or green — red on paper (r > 60, g < 0.55 r, b < 0.45 r) —, closed by ~12 m; a piece of
  600 m² whose ink fills ≤ 60 % of it is overprint; what an opening of ~20 m keeps (1 500 m² at least) is out of bounds (`A.OOB`,
  the cells' `over` 1), the rest, red, thin and 60 m long, a forbidden route (`over` 2: 40 % speed, no path, no handrail — crossed,
  not followed). Within 75 m of the course's controls (the pages send them: the worker's `controls` op, `releaseAround`) it is
  the course's own circles and numbers: released. On an image map a line read as a path no longer opens a building, water or an
  out-of-bounds area (it did: a château's black edge read as a track). Found: Fougères' château and « Maison Neuve » hatching, its
  rides' crosses; the Gif scan's three pink hatched areas. **The map's own brown is never overprint** (owner, 2026-11-05: on the
  Desquinemarre map, exported from OCAD at 150 dpi, the brown rgb(209, 66, 0) passed the red test and its contours, closed into one
  114 ha piece, put 17 % of the map out of bounds — no route at all on two legs; Purple Pen's SampleEvent 4 %, Lincoln Park 17 %):
  `mapBrown` takes the most frequent red colour as the map's brown when it lies in a quarter of the ~50 m blocks holding ink (contours
  are everywhere, hatching and crosses local), and leaves out of the red the pixels of its hue (± 10°) and their 1-pixel edge — now
  0.06 %, 0.02 %, 0 %; the Fougères photo and the Gif scan find no such brown (a photo's brown is pale) and read as before. A map
  whose brown is both red and everywhere and whose overprint over yellow has the brown's hue would lose its hatching. **Impassable walls and fences are not read** from an image: on the
  Fougères photo their tick marks (0.4 mm, two blurred pixels) do not separate them from paths by width or spurs (measured). Cost of a step = metres × terrain (speeds in % of white forest, `DEFAULTS.speeds`) × slope (up: 1 + climb × grade, 8 flat
  metres per metre by default; down: 1 − 0.6 × grade to 15 %, then + 2.5 per unit) × the **navigation caution** (1 + caution ×
  visibility × min(1, distance to a handrail / 50 m): handrails = paths, streams, edges between visibility groups, blocked areas'
  banks; caution 20 % by default); the times shown exclude the caution. Heights: `terrain.js`'s grid (IGN, else the tiles), flat
  if it fails, **refined by the map's own contour lines by default** (owner, 2026-11-01: « the map contours are always more
  accurate than IGN or any public source » — the 3D view's measure of 2026-10-24 could not show it, IGN being its reference):
  `routeplan.reliefGrid` runs `contours.refineGrid` (each line's level from the model, the model filling between them) on nodes
  ~2 m apart (`size`, 4 million at most) and the worker samples it per cell; settings `relief` "contours" | "dem", `interval`
  2.5 / 5 / 10 m; « Analyse multi » keeps the model's grid and refines it again when they change (`rcmDem`). On the Fougères
  photo (2.13 m/px, its 0.14 mm contours under a pixel) only 30 pieces are read; a scan reads far more. **The search** (`legSearch`): two complete Dijkstra trees on 16 neighbours over an ellipse (0.75 L + 150 m), from the
  start and from the control; T = their sum = the cost of the best route through each cell (A* was already exact: searching from
  the arrival too gives the same best route, but the sum gives the choices). Candidates: the best route, the longest « plateau »
  (steps both trees take), then the other plateaus and the « cuts » (every tenth of the leg, a line across it; each valley of T on it
  with a prominence of 1.5 % of the best, 4 s at least) by cost; the route through a cell = the forward tree back + the backward tree
  on. Kept when ≤ best × (1 + `extra`), a fifth of it outside the kept routes' corridors (max(20 m, 0.12 L)), and either it crosses
  some cut line in a valley no kept route crosses it in (the ridges between the valleys) and is locally optimal over 30 % stretches,
  or it lies 30 % apart and is locally optimal over 50 % stretches (1 % + 1 m) — an arc through uniform forest is no choice. Each
  kept route pulled tight (`tighten`: straight lines no costlier than the grid's way, nothing impassable, within 2 cells of it) and
  measured off the grid like a runner's (`polyline`, as `lineRoute`). The **decision map** (« Carte des décisions », `ocn.rc.dec`):
  T / best − 1 per region cell, dark green to orange up to `extra`, nothing beyond (`decisionPicture`, the worker's `decision` op,
  `drawDecision` under the routes). The panel: a progress bar under the status (the reading by stages, the relief, the legs), a
  warning when the reading looks wrong (`readingWarning`: grey + buildings over 20 % in forest, one class over 2/3, no path), the
  terrain's legend under « Voir le terrain tel que lu ». Measured on the Fougères photo (960 × 1280, 2.13 m/px): read in 0.8 s, the
  six north lines found, 16 legs in 1.2-2.3 s; S-1 best = along the track (72 % on paths), the runner's route matched to A. On the
  Gif scan (0.635 m/px): read in 3.3-4.7 s, six north lines, the dashed paths as a network. Synthetic legs (scratch `synth_new.mjs`):
  16 of 19 expected choices, no arc offered in uniform forest; a straight way far from any handrail beside a track is not locally
  optimal under the caution (the caution pulls toward the track), so it is not offered. Scratch: `rc/` in that session's scratchpad
  (`fnew.mjs`, `synth_new.mjs`, `gpic.mjs`), copied to `C:\kerkia\Ozimut\work\scratch-scripts`. Not done: the line network as a graph
  of its own for the search (the raster's path cells carry it), form lines, dashed contours.
  **A runner's route** (owner, 2026-11-01: on leg 1 the runner took A along the track, yet « Choix » said +0:43 — the GPS line, a
  few metres beside the track, was measured in the forest): `matchRoute` lays the trace on the map — the model's fastest way from
  control to control within `matchTol` (8 m + the calibration's fit, 12-25 m; 15 m in Multi) of the trace, on the track when the
  trace runs along it, the corridor doubled once if the trace crosses what reads impassable — and measures its share along each
  computed route (points every ~2 m within the tolerance). `routeplan.chosen`: a route followed for 80 % of the length is the
  route taken (its letter, its time); else the shares are listed (« B 64 % · A 10 % ») and the laid trace's time counts. Choix =
  the time taken − A's (0 when A was taken); Exécution = the real time − the time taken; the automatic pace from the same times.
  On the Fougères photo 7 legs of 16 match a route outright (leg 1: A at 100 %, Choix 0). The worker's op `match`; `lineRoute`
  stays for any line.
  **The calibration on the legs run** (owner, 2026-11-01; `calib` setting, on by default, « Calibrer les vitesses sur les postes
  courus »): `segment`/`polyline` split a route's model time into `parts` (on paths, off them, what climbing and descending add);
  `routeplan.calibrate(samples)` fits time = pace(runner) × (path × α + off + up × γ + down) on the runners' routes as laid on the
  map — α, γ on a log grid, each runner's log pace the median of their residuals, the score the absolute residuals plus a prior
  holding α and γ at 1 (`CAL`: 0.12, spreads 0.2 and 0.4); α only with two legs mostly on paths and two mostly off, γ only when
  climbing is 4 % of the time over six legs; legs over 25 % off the fit set aside and the fit made again; 5 legs at least.
  `calibrated(s, c)`: the paths' speeds ÷ α, the climb × γ. Solo: a first pass, the fit, then every leg again with the runner's
  speeds (A becomes their best route), the pace the fitted one; Multi (`rcmCalibrate`): every leg of every runner laid on the map
  once per settings, the group's α and γ, each runner's own pace for their Choix and Exécution. Measured: Fougères 8 of 16 legs,
  paths 140 %, climb 9.6 m, both passes 17.6 s; « Test UI club » 4 runners, 25 of 52 legs, ~1 min for the group's pass.
  Pace: the one typed, else (solo) the median of the runner's legs' actual ÷ model time, (multi) the runners' median on the leg,
  clamped 3-20 min/km, else 6:00. Solo computes every leg (the current first) and adds the card « Itinéraires calculés » (Choix =
  model of one's route − A; Exécution = actual − model); multi computes the leg shown and lists the runners shown. Settings in
  `localStorage ocn.rc.prefs` (the map's kind from the race: sprint by its name/discipline), the box's state `ocn.rc.on`.
  « Voir le terrain tel que lu » draws the cells over the map. `window.anDebugRoutes()` on both pages. Measured 2026-10-24 on the
  reel's invented map (2160 × 1440, 0.42 m/px): the map read in ~2.5 s, a leg 0.5-2 s; on the local test analyses' scanned GIF
  the contours were first read as paved areas (fixed by each ink's own width). Documented in the guide (« Courses › Itinéraires
  calculés », `content/guide.*.js` chapter `routes`, shown to administrators only). **OCAD and Mapper maps** (owner, 2026-10-24):
  `trace/vectorroutes.js` reads them with the Tracer's `tracer/vmap/` (`readVector`: the frame of `mapsrc.openVector`, its
  `geoFromVector`) and draws the engine's layers on the image's pixels (`layers`; the worker's op `layers` instead of `init`, no
  colours read): areas by their fill colour (hatching: blue marsh, olive/purple out of bounds; pattern green/black: slow), colour by
  colour from the bottom of the colour table; lines by symbol number (501-508 paths drawn solid, of their three kinds; 201, 515, 518, and 521/524 as
  lines block, at their line's own width (a fence's ticks span 1.8 mm), opened only at a crossing point (519; ISOM 2000's 525) — owner, 2026-11-05: a path crossing them or running along them opened them, and the routes of « Entrainement OPA Montigny » went through a fenced enclosure; a path still crosses water and buildings, never an out-of-bounds area; 202, 415, 416, 513-523's passable ones handrails;
  blue lines streams); contours, points, text and course left out. « Analyse solo »: a .ocd/.omap/.xmap dropped with no image is
  the map (rendered by `mapsrc.openMap`, georeferenced by its own grid: `files.geo.corners`), else (or from the routes box) a
  companion `files.vector` placed through its georeference and the calibration (`throughGeo`, refused under a fifth of the image
  covered: `cover`); « Analyse multi »: the routes box's file, placed through `course.geo`, this visit only. Tested 2026-10-24 on
  Purple Pen's samples (Clouds, Penistone Hill, Ft Casey, Lake Sammamish, SampleMap georeferenced in UTM 10 with a synthetic GPX;
  Mapper's HG_Mar28 sprint): the layers in 0.1-1.5 s, the companion's placing equal to the map's own to the pixel. Not done: learning
  the speeds from the shared traces, purple out-of-bounds hatching on an image map (erased with the course).
  **Crossings and slow ground** (owner, 2026-11-10, after reading Sárközy & Albert, *Comparative analysis of route-planning methods
  and time-cost estimation in terrain navigation*, Int. J. of Cartography 2025 — its best model is isotropic and additive, Ozimut's
  already better there; two ideas taken): on an OCAD or Mapper map, **each crossing of a passable line costs time** — earth banks and
  walls, gullies (104-108), passable cliffs (202), passable walls and fences (513, 514, 516, 517) — the layer `cross`, drawn at the
  line's own width; `DEFAULTS.cross` 10 s at `CROSS_PACE` (6:00 min/km, the model's units being metres of white forest, so a
  runner's pace scales it), charged on entering the line (`routechoice.crosses`: a diagonal between two of its cells, a knight's
  move over one), nowhere a path lies on it, in `step`, `segment` (parts `cross`, `xn`) and the tour's `costsFrom`; **calibrated**
  (`routeplan.calibrate` κ, prior sd 0.7, grid 0.1-5, three rounds with α and γ) once the runners' laid routes cross 5 times over 3
  legs, else 10 s; the slider « Franchir un talus, un mur, une clôture » and the calibration's line show it with a vector map only.
  **Slow ground by symbol number** (`slow` 1-3, `speeds.slow1-3` 70/40/15 %, multiplied over the vegetation): dense boulder field 209,
  stony ground 210/211/212, sandy 213 as areas — no longer read as slow-running forest by their black dots, nor a boulder field 208
  (ISOM: no slowing); stony ground drawn as single dots (Desquinemarre's 210.1: 0.004 dots/m², a quarter of the specification's
  slow-running density) does not count. By number too: 409 walk, 307 uncrossable marsh (impassable), ISSprOM's 411. **The map's
  standard** (`vectorroutes.standardOf`, `STANDARDS`): 104 a line, 109/110 points → ISOM 2017 / ISSprOM; else ISOM 2000 (and ISSOM
  2007, the same numbers: 519-524 walls and fences, 521/524 the impassable ones, 525 the crossing point, 515 railway, 518 tunnel —
  Purple Pen's SampleMap and Ormeau), unless 525 is a line: an ISOM 2000 template shifted by one from 516 (Penistone Hill, Woodland:
  522/525 impassable, 518 a power line). Before, 515 and 518 blocked on every map (ISOM 2000's railway and tunnel), and the blue
  north lines (601) were read as streams, a strip of marsh along each (Desquinemarre: 3.6 ha); 6xx-9xx lines are now ignored. Stored
  layers « OZL2 » (the second plane hand | cross << 1 | slow << 2; « OZL1 » still read, without them: an analysis published before
  gets them when published again). Measured on Desquinemarre (12 random legs of 150-450 m; Penistone and Ft Casey alike): without the cost 3 of 12 legs crossed a
  bank or fence, with 10 s one (unavoidable), the routes no slower; synthetic tests in the session's scratch (`t_cross.mjs`,
  `t_cal.mjs`: κ 2 recovered as 2.0 on 52 legs, 0.5 as 0.6).
  **Kept with a map analysis's circuit** (owner, 2026-11-05: « you have the OCAD map information, why read colours? »): a circuit made
  from an OCAD or Mapper map — the Tracer's « Publier vers l'analyse de carte » and Orga's « Importer un fichier OCAD » — gets its
  layers drawn at that moment on the circuit image's pixels (`tracer/circuits.js circuitLayers`: the map's symbols with the frame's
  exact mm → px, plus the setter's specials shown on that course — « out-of-bounds » and « dangerous-area » as out of bounds,
  « boundary » and « mtbo-forbidden-route » as walls no path opens), packed (`vectorroutes.packLayers`: « OZL1 », the size, two
  planes deflated, ~65-75 KB for 1754 × 1241 against 1.2 MB of PNG) and stored as `analyses/<id>/layers-<n>` (`GET|PUT …/layers/<n>`,
  the visitors' `/v/…/layers/<n>`; the circuit's `layers: { map }` names the map version they were drawn on — a new map drops them);
  the OCAD file itself is never sent. « Analyse de carte » (`shared.js rcmStored`) and Solo on the organiser's map (`loadOrgaMap`) read
  them (the panel: « Carte OCAD de l'organisateur »), a file dropped in « Calcul » still winning; the publication's progress window
  has a step per circuit for them. Measured on the Desquinemarre « très court »: drawn in 0.4 s, the planner ready in 0.9 s against
  3.2 s for the image, leg 39 → 31 A 6:19 / 389 m nearly straight (no route at all from the colours before the brown fix).
- **Languages: French, English, German and Spanish** (owner, 2026-10-17 French and English, open to everyone since 2026-10-18,
  `i18n.OPEN` true; **German and Spanish since 2026-11-01**: `i18n.LANGS`, catalogues `i18n/de.js`, `es.js`, `tracer.de.js`,
  `tracer.es.js`, long texts `content/<name>.de.js` / `.es.js`, e-mails in `_lib/templates.js`, `manifest.de|es.webmanifest`;
  Purple Pen's symbol names and texts in `tracer/symbols.json` (`docs/tracer/symbols.py` `MAIN_LANGS`); vocabulary and register in
  `docs/i18n/glossary.de-es.md` — German « du », Spanish « tú », classes H/D kept in German, M/F in Spanish (`util.fmtCat`),
  `de-DE` / `es-ES`. **The owner's rule (2026-11-01): a German or Spanish reader never sees French, anywhere** — English is
  acceptable only for the white paper and the home page's pictures (and a few Purple Pen symbols it has no German or Spanish
  for); every tool (the Tracer, the analyses, the games…) is localised like the rest. So **every change of UI text is made in
  the four languages in the same commit**: a key added or reworded in `fr.js` gets `en.js`, `de.js`, `es.js` (and an area's
  `<area>.*.js`) at once; a long-text module gets its `.de.js` / `.es.js`; an e-mail or push in `_lib/templates.js` gets its
  four versions (`pick(lang, { fr, en, de, es })`); a code path that chooses a language never has a French « else » for
  the others (`lang() === "fr" ? French : …`, never `lang() === "en" ? English : French`); text the Python side writes into
  the data and a page shows is translated through the catalogues. A missing German or Spanish key falls back to English
  (the long-text modules too), French only as a last resort that the check forbids. **A pre-commit hook enforces the
  catalogues**: `tools/git-hooks/pre-commit` (`git config core.hooksPath tools/git-hooks`, set on the PC) runs
  `node tools/i18n_check.mjs --strict` on the staged files and stops a commit with a key missing in any language, a
  placeholder or tag that differs, or French written in the code — never skip it (`--no-verify`); translate instead). **Never write UI
  text in the code**: every text goes in the catalogues, `site/assets/js/i18n/fr.js` (the reference: a key exists there
  first) and `i18n/en.js` (same keys, same `{placeholders}`), read with `t(key, vars)` (and `tn(key, n)` for counts: keys
  `x.one` / `x.other`) from `i18n.js`; an area's own catalogues `i18n/<area>.fr.js` / `.en.js` (`loadArea`, the Tracer's);
  long texts (documentation, guides, legal pages) are whole modules per language, `site/assets/js/content/<name>.fr.js` /
  `.en.js` (privacy, vma, orgdirect; the Documentation's `methods.*.js` export `build(X)`: the page passes its neutral
  helpers and data, the module returns the tabs, panels and the charts that carry words — keep the two in step, same
  code, French the reference). The Tracer: its catalogue `i18n/tracer.fr.js` / `.en.js` (keys `trc.<module>.*`), loaded by
  `tracer/lang.js` with a top-level await — every Tracer module imports `t` from it, never from `i18n.js` directly. English
  vocabulary: `docs/i18n/glossary.md` (IOF terms, Purple Pen's English for the Tracer; FFCO's classes H/D shown M/W in
  English: `util.fmtCat`, `fmtSex`; `ui.dataTable` shows a column keyed `cat` through it). FFCO's formats word by word
  (`util.fmtFormat`: Nuit → Night, keys `format.<word>`), percentages `util.pct` / `pctN` (« 12 % » / « 12% »), a label
  and its colon `t("ui.colon", { a })`; a CSV's separator « ; » in French, « , » in English. Numbers and dates through
  `util.fmt` / `fmtDate` / `i18n.locale()`, never a hard-coded `fr-FR` (what the Tracer prints on an event's map follows
  the event's own description language, `ev.lang`). The language: the one chosen (`localStorage ocn.lang`: the language
  menu beside the theme on every page, signed in or not — `app.langMenu`, a globe and the code, each language in its own
  name —, Réglages, the registration form's first field, `?lang=`), else the browser's (the first of its preferred
  languages the site has, English when none). A change redraws the page (`setLang` reloads); the registration form keeps
  what is typed, passwords apart (`sessionStorage ocn.reg.draft`). **The account's language** (D1 `users.lang`, migration
  0009): set by the menu or Réglages when signed in, by registration (the form's language); every e-mail is written in its
  recipient's (`_lib/templates.js`, French and English side by side; the administrators' alerts in each administrator's).
  At login a language chosen on the device becomes the account's (`i18n.storedLang`), else the device takes the account's
  (`i18n.adoptLang`). « IA » answers in the asker's language (`systemPrompt({ lang })`) and its errors
  carry a `code` the page words. The white paper exists in both languages (`docs/whitepaper/methode-top.en.tex`,
  `site/assets/ocn-methode-top.en.pdf`). `?lang=xx`: a pseudo-language that marks every catalogue text, so what the code
  writes itself shows plain. `node tools/i18n_check.mjs` lists keys missing in a language, placeholders that differ,
  French written in the code and French typography between placeholders (`--list` for all; a line marked `i18n-ignore`,
  or the N lines after a comment `i18n-ignore-next N`, are patterns or names, not UI text).
- UI text lives in the catalogues (`i18n/fr.js`, `i18n/en.js`; above). Method keys: `official`, `top6w`, `top6w3`, `fair`, `fair3` (labels « Top » /
  « Fit » for the published pair, « Top géométrique » / « Fit géométrique » for the geometric one, since 2026-10-16). Old saved selections or links naming the removed
  `v2026`, `top6w2` or `fair2` are mapped in `store.js` (`RENAMED`).
- Runner race rows (`R`) and race result rows (`C`) carry each method's columns, the geometric pair (`f3*`, `t3*`)
  appended after the published linear ones (`f*`, `t6*`; `site_ask` reads the Top from `t6*`) (`data.js`: `SCORE_COL`, `CNAFTER_COL`, `CNJ15_COL`, `COUNTS_COL`, `WEIGHT_COL`,
  `C_SCORE`, `C_CNJ15`).
- The archived seasons (before 2024) are members-only on the FFCO site — listings and, since 2026, the race
  pages too: re-reading them needs a fresh `FFCO_SESSIONID` (the `sessionid` cookie of a logged-in member) in
  the environment; normal runs never need it. The workflow's `backfill` mode (manual) fetches every season's
  competitions not stored yet, with the repo secret `FFCO_SESSIONID` (the owner sets it, then deletes it).
- **Anonymised runners** (owner, 2026-10-15; `privacy.py`): on request (not to be shown, a minor's representative, erasure of
  results data) a licensee's name and licence are replaced all over the published site by a pseudonym — « Coureur anonyme N »,
  licence 9000000N (8 digits; real licences have at most 7; `data.isAnon` hides the licence and skips FFCO's lookups). Nothing
  is deleted: the database and every computation keep the real licence, so the others' places, circuit values and CNs are
  unchanged. The admin page's « Anonymisés » tab keeps the list in R2 (`privacy/anonymized.json`, `/api/admin/anonymized`);
  the workflow copies it to `CN_DATA_DIR/privacy/`; `update.sync_privacy` keeps the last list in `engine_meta`
  (`anonymized_list`) and restores it when the copy is missing (an empty list would publish the names again), and
  `update.apply_privacy` rebuilds the whole site data and the provisional results once when the list's fingerprint changes
  (`engine_meta` `anonymized`; an incremental build keeps old seasons). `build_site` maps every licence read from the database
  (`Anon.lic`), names come only from `runners.json`; the auth index keeps their real licence and name (they can still sign
  up). Provisional results: rows matched to their licence, unmatched rows by name (`privacy.anonymise_row`, birth year and
  bib dropped). Not covered: « En direct » (liveresultat relayed live).
- **Demo accounts** (owner, 2026-10-18: to let Swiss Orienteering, or any federation, league or club, see the site): made on the
  admin page's « Démo » tab (`functions/api/admin/demo.js`: label, sign-in — else `demo-<label>@ocn.invalid`, a domain that
  receives nothing —, days, language; a readable password shown once with a message to copy; +30 days, new password, disable /
  enable / delete through `/api/admin/user`). D1 `users.demo_until` (migration 0012, the last valid Paris day; NULL for every other
  account), no licence (`licence` ''), no alert. **Read-only**: the session cookie carries `demo` (`api.sessionCookie`, never
  longer than the account) and the login gate refuses every method but GET/HEAD/OPTIONS except `/api/track` and `/api/ask`
  (`DEMO_WRITES`, 403 `demo`); past its day the login says « disabled », `currentUser` and the gate's hourly check refuse it. Kept
  out of « Comptes » and « Inscrits ». In the app (`session.demo`): no « Ma page », the brand and the home page lead to
  the agenda (every account's since 2026-10-21), an orange line under the bar (`demo.strip`), Réglages reduced to what the account is and the language, no
  push offer. The privacy page names the exception to « accounts reserved to licensees ».
- **Privacy and legal notices** (`#/compte/confidentialite`, `pages/account.js` `privacy`, public; reviewed 2026-10-15): the
  GDPR's information (controller Yann Le Helloco, legal bases, licensees without an account and their right to object,
  processors Cloudflare / Resend / GitHub and their transfer safeguards, the IP-keyed rate limits, every right, the CNIL)
  and the legal notices (publisher, host). When the site starts keeping new data, say so there and update its date.
- Accounts: e-mail + password with confirmation; registration checks name + licence against the licensee index
  (`site/auth`, never served); several accounts on one licence are allowed but flagged to the admin.
  Rights per account, set on the admin page (D1 `users.analyst`, `users.alerts_allowed`; they apply to admins too,
  so an admin can uncheck « Analyse » to see the site as a regular user does): the
  analysis methods, and the agenda e-mail alerts — new courses (`agenda_alert`) and registrations closing within
  8 days (`deadline_alert`, `deadline_announced`), sharing one list of regions; both are sent by `/api/notify`
  from the daily agenda run. **D1 migrations are not applied by CI**: run `npx wrangler d1 migrations apply ocn
  --remote` (owner's go-ahead) before deploying code that needs them.
  New-account alert: when an account is confirmed (`api/account/verify.js`), each administrator whose
  `users.signup_alert` is on (default; their own checkbox on the admin page, `api/admin/prefs`) gets an e-mail.
  **Welcome e-mail** (owner, 2026-10-21): the confirmed account gets one too (`templates.welcomeMail`, in its language: the
  site's four groups — the ranking's line only with France, else how a federation's rankings open —, the alerts by
  notification, an invitation to reply or to write through « Nous écrire »), once, priority 0, an account e-mail (the alert
  right does not apply); signed « L'équipe Ozimut » / "The Ozimut team"; sent while `WELCOME_MAIL` (wrangler.toml) is "1" (on since 2026-10-21, the
  owner having approved its text).
  « En direct » (`#/direct`, `pages/live.js`; menu « Courses »: Agenda, Résultats, En direct) for every account since
  2026-10-15 (the `users.live` right before: migration 0007; its admin page checkbox removed 2026-10-16, the column kept
  unread): liveresultat's races from O'CN's live relay (`live/`, Worker `ocn-live`), through O'CN's own Functions — `/api/live/list` (kept in the edge cache for the directory's lifetime, 2 min)
  and `/ws/<race>` (the WebSocket handed to the race's object) —, signed-in accounts only: the login gate passes the 101
  handshake on untouched (`_middleware.js`); each runner recognised by name (+ club number) and linked, their CN Top and
  official in the race's discipline (guessed from the names: sprint, VTT, ski, else forest) and the place their Top
  CN predicts (« Attendu »). The race page (owner, 2026-10-21/22, phone first): name, organiser and day beside the status and
  one ranking button; the latest punches on one line scrolling sideways (no filter there; ▾ opens them as a table); three
  selectors side by side, the one in use outlined — a course (each with its finishers / starters: the relay reads the classes
  nobody watches for their counts only, a few per wake-up, message `counts`), a club (« Mon club » first: France's runners of
  one's club recognised, the club names the race writes for them, else the club typed in one's countries; « Encore en
  course », everyone still out; then every club; `#/direct/<race>/~club/<key>`), the punches (all, or one's club's;
  `~passages/<all|mine>`); on a wide screen the course selector is the list at the left, headed by the same views
  (« Suivre »: Mon club, Encore en course, Tous les passages, Passages de mon club; owner, 2026-10-22); one search under them for a runner (opens their course, the row marked and scrolled to the middle)
  or a club. The club and punches views, the club list and the search watch the **whole race**: the page subscribes `"*"`,
  the relay then reads every class as a watched one (those just punched first, at most `MAX_READS` a wake-up; `ALL_NOW` at
  once when asked) and sends them all; it keeps every class under its own storage key (`c:<class>`, the former single
  « data » value migrated at the first save). Every table has the start time; no scrollbar of its own (the last columns may
  scroll sideways), every runner on two lines (place | name | [course] | club | start | time/gap | CN/expected | score/gap),
  the runner's category (from the data) when the class is not one, under the place on a phone; the first column (« Place », the
  punches' time of day) frozen when a table scrolls sideways (owner, 2026-10-24: opaque, the row's tint `--lv-tint` drawn over
  it). **One line per runner, a preview** (owner, 2026-10-24): each two-line cell split into two columns (Temps | Écart, CN |
  Attendu, Score | Écart {cnTo}, Catégorie, in « Passages » Nom | Club and Circuit | Cat.), nothing wraps, the table scrolls
  sideways (`live.js` `ONE`, `.lv-one`); shown only to the accounts whose D1 `users.preview` (migration 0015, features
  separated by commas, set by hand: `UPDATE users SET preview = 'live1line' WHERE id IN (…)`) names it (`_lib/api.js` `previewOf` →
  `preview: ["live1line"]` on `/api/account/me`, kept by `auth.fromUser`); local test: launch configs `ocn-live-1line` (the mock
  and the relay in one) + `pages-dev-1line` (8791; the flag set on the local test account in the local D1; start it once the relay
  is up, or the WebSocket fails); the punches' table (« Passages »,
  owner 2026-10-22): **every punch of the last 15 minutes**, derived from the courses' results (each radio control passed and
  each finish at start + its time; the relay's last 30 only for a course not held yet), else the latest 20 — time of day, the
  event (radio control ○ / finish ◎), runner and club, course and category, time and gap, place, start. **Recent ones
  coloured** in every table and on the punches' line: green within 3 min, yellow within 9 (a runner's last event: the finish,
  else the last radio control; redrawn every 30 s). « Passages de mon club » can **vibrate and beep** at each new punch
  (`localStorage ocn.live.buzz`; the sound starts from the box's tap, a test ring; silent until every course has arrived,
  then only for punches under 2 min; the screen kept on by the Wake Lock while ticked; no vibration on an iPhone). A runner's state is liveresultat's status first (9 started, 10 not
  started), then the start time against the clock. **The selectors are redrawn only when they change and never while one is
  open** (2026-10-22: an update arriving while a phone's selector was open replaced it, and the choice was lost — the « stuck
  on Derniers passages » report); on a phone they and the search are 16 px (a phone zooms into smaller fields). Local test:
  launch configs `lr-mock` (8795, a recording kept outside the repository; `--live --speed 1 --from <min>` replays it on today's clock) + `ocn-live-mock` (the relay reading it) +
  `pages-dev-games`. The list page: the site's country's races, a search looks in every country (the other countries' chips
  beside the search, 2026-10-21/22, are gone since 2026-10-23: Agenda and Résultats had none; `country.hint` says whose list it is
  and opens the header's menu). **The countries of its races join the country menu** (owner, 2026-10-29: Sweden, whose agenda
  Ozimut cannot read, had left it on 2026-10-24): `country.noteLive` keeps the list's countries in `localStorage
  ocn.liveCountries` (6 h; read at the start of a signed-in visit by `refreshLive`, and by the page), `withData` offers them,
  « ocn:countries » redraws the header. **Live now** (owner, 2026-10-22: « identify clearly which competitions are truly live »): the
  relay's `Directory`, when the list is asked for, reads the last passings of the races of their own today (with liveresultat's
  hash, at most every `PROBE_MS` 3 min a race and `MAX_PROBE` 15 a call; `probes` kept for today's races only) and adds to each
  race the age of its last punch in seconds (`comps[i][6]`, from the race's time zone, else liveresultat's offset from Swedish
  time); a race is live under `LIVE_S` (30 min). The page puts them in a box « En direct maintenant » on top (the latest
  punch first; no punch age shown, owner 2026-10-22), marks them « direct » in the list and sorts them first; a broadcast that
  sent something in that time is marked too. **Flags beside every country choice** (owner, 2026-10-22): `country.flagImg` in
  the header's menu (its button shows the site's country's flag), the registration's and Réglages' country fields (the flag
  of the country chosen beside the select: an option cannot hold an image) and the list of one's countries. `localStorage["ocn.liveBase"]` points it at another server for tests (unset: this site).
  Usage: the app posts each page view of a logged-in account to `/api/track` (route, Réseau views apart; a new
  browser session = a visit) into D1 `usage_daily` (account, Paris day, page, views; 13 months, deleted with the
  account); the admin page's « Utilisation » tab reads `/api/admin/usage` for any period. The privacy page says so. The
  « Inscrits » tab (2026-10-15, `/api/admin/members`: sign-up times, status, admin flag and the days seen, no names or
  e-mails) counts the registered accounts (confirmed, not disabled) and the active ones (a page view in the last 21 Paris
  days), today and day by day; visits are counted since 2026-10-07 (the window complete from 2026-10-27); a deleted
  account leaves no trace.
  Mail through Resend with daily/monthly quotas and a reserve for account mails (`wrangler.toml` vars), **then Scaleway's
  Transactional Email beyond them** (owner, 2026-11-01; `_lib/mail.js`): the registration's confirmation and the password reset
  (`URGENT`) and the contact form go to Scaleway at once when Resend's day is full or Resend fails; every other mail waits
  `RESEND_WAIT_HOURS` (48) in `mail_queue` for Resend's quota, then goes through Scaleway; `TEM_MONTHLY_LIMIT` (50 000,
  Scaleway's quota once payment method and identity are validated; 10 000 with the payment method alone) caps it. A Scaleway refusal is never final (the message stays for Resend). `mail_log.provider` (migration 0021,
  NULL = Resend) splits the counts; the admin « Consommation » tab has a Scaleway row. Needs the Pages secret `SCW_SECRET_KEY` and
  `SCW_PROJECT_ID` (wrangler.toml), ozimut.com verified in Scaleway (DKIM; Scaleway's SPF include written directly in ozimut.com's
  SPF record beside Proton's — its checker does not follow nested includes); without them mail waits for Resend as before. Its
  API takes 2 MB a message and a fixed list of attachment types: a contact message with others stays on Resend. Tested on a
  simulated D1 and providers. **« Essai d'envoi »** (owner, 2026-11-03; the admin page's « Consommation », `/api/admin/mailtest`,
  `mail.sendTest`): one e-mail through Resend or Scaleway, whatever the quotas — its sender (an address of the site's domain), recipient,
  subject and text pre-filled (`templates.testMail`, the administrator's address) and editable —, the provider's refusal
  shown as it came — to check a key after its renewal (Scaleway's API keys expire within a year, the organisation's limit).
- **Countries** (owner, 2026-10-20: Ozimut open to every orienteer; the plan in nine steps — data model, access by path in
  `_middleware.js`, a CN-free copy of the provisional results, the front end by profile, registration and Réglages « Mes pays »,
  admin, texts, an admin « Consommation » tab, a global country selector): an account joins countries (D1 `user_countries`,
  migration 0014: ISO alpha-2 code, club as typed, member id, status `ok` / `pending` / `refused`; every account of before
  backfilled as France). `functions/_lib/countries.js`: the IOF's member countries (`COUNTRIES`), each one's policy — France
  `ffco` (name + licence against the licensee index, `checkLicensee`), the others `open` (declared) —, `checkMembership`,
  `memberships` (in the order joined: the first accepted is the user's default country), `accountView` (the user and a fresh
  cookie). The session cookie carries `cc`, the accepted countries (a demo account: France), refreshed by the login gate's
  hourly check. France's membership is `users.licence` (joining sets it with FFCO's display name, leaving clears it and drops
  the relay runners). `/api/account/countries` GET / POST `{ country, club, id }` / DELETE `{ country }`; `/api/account/me`
  and the login return `countries`. A club typed by the user grants nothing; only clubs of an accepted country do. Registration
  takes `countries: [...]` (`licence` alone = France); `WORLD_OPEN` (wrangler.toml) "1" since 2026-10-20 evening (owner):
  registration open to every orienteer, no country required ("0" would require France again). **Cloudflare Turnstile** on registration (`_lib/turnstile.js`; the form loads
  challenges.cloudflare.com's script, the one script from another host, there only and only when `/api/account/status` gives a
  site key): `TURNSTILE_SITE_KEY` in wrangler.toml, `TURNSTILE_SECRET` a Pages secret (the owner's); either missing = no check.
  Locally, Cloudflare's always-pass test keys in `.dev.vars`.
  **Access by country** (step 2; by each country's folder since 2026-10-22, « Countries as modules »): the login gate refuses
  a country's data to a session its rule does not let in (403 `{ error: "country", need: "<cc>" }`, `_middleware.js` `needs`):
  `/data/<cc>/…` follows `_lib/access.js` `DATA_ACCESS` (France "members", Spain "all"; a country without a rule: nobody),
  but for `DATA_FOR_ALL` (a country's competitions, agenda, evaluation, validation; `prov/pub/`) and the public `meta.json`
  files; anything else under `/data/` (the provisional results' full files) is France's — deny by default, list a new file
  there only if it holds nothing personal — and so are the APIs of `FR_API` (`ffco-cn`, `ffco-history`, `ask`, `account/relay`). A cookie without `cc` (issued before) is
  checked at once. The Functions' own `env.ASSETS` reads (`_lib/club.js`) do not go through the gate. In the browser
  `auth.sees(cc)` (the session keeps `uid` and `countries`; one without a licence stays signed in; only a 401 signs out —
  `data.getJson`, Réglages, `app.route_`'s private boot —, never a refused or failed read, owner 2026-10-21; the gate keeps a
  handler's own session cookie instead of appending its hourly re-signed one, which overwrote a country just joined), and
  `data.bootPrivate({ fr })` leaves the runners empty without France. The pages are not yet adapted (step 4): until then
  `WORLD_OPEN` stays "0".
  **The provisional results without France** (step 3): `prov.run.build` writes beside each file a copy in `prov/pub/`
  (`public_copy`: runners without `PUB_RUNNER_DROP` — licence, FFCO figures, scores, CNs, `catCn`, birth year —, classes
  without `values`; the index without `PUB_INDEX_DROP` — `lics`, `rlics`, `matched`); `auth.provDir()` picks the folder (the
  pages through `provisional.getProv`, the Tracer's offline copy). Names, clubs, categories, times and splits stay: what the
  organisers publish (owner, 2026-10-20: as open as possible).
  **The pages by profile** (step 4): `app.FR_ROUTES` (the rankings and all they hold, « IA ») give an account without France
  `pages/needcountry.js` (what joining France opens, a link to Réglages › Mes pays) in their place (`r.from`: the page keeps
  its group and menu row, `menuKey`); the « Classement » group stays in the bar, it has no method switch and lands on the
  agenda (`homeOf`, every account's landing since 2026-10-21). **Gate by data, not by page** (owner, 2026-10-20, after « Organisation » opened on the join-France page
  and its pages looked locked): the organisers' pages are everyone's, their lists hold the competitions of the countries
  Ozimut reads (empty without France: `sh.org.noCountry`). A group's tab follows its memory (`ocn.nav.<group>`, the browser's,
  shared by every account signed in on it) only to a page of its own menu. Test a profile as a regular account
  (`pages-dev-user`: an administrator sees every organiser's list) and through the group tabs, after a session of another profile. Résultats and En direct drop their CN, score, expected-place and « matched » columns and tile without
  France; the Tracer's winning times need France. **The site's country** (`country.js`, owner, 2026-10-20: one global
  choice beside the language rather than a filter per page): the countries with data are `meta.json` `countries` (France
  alone when absent); the header's menu is the one place to choose it (owner, 2026-10-21: the Agenda's « Pays » field and En
  direct's own selector are gone) and offers **every country** (owner, 2026-10-29: a country is never left out of it; from 2026-10-24 to 29 only those with data
  were, which dropped Sweden): the account's own countries, a line, the countries with data (meta, plus « En direct »'s,
  `noteLive`), a line, every other IOF member (`MEMBERS`), each part by name, France first (`.cty-sep`). **Each page's « Choisir
  un autre pays »** (`country.hint(list)`, `hintList`; owner, 2026-10-29) offers only the countries that page has something for —
  the Agenda's those with an agenda, Résultats' and Analyse de course's those of their races, En direct's those of its list,
  Analyse multi's those of its analyses — in a small list under the line, then « Tous les pays… » (the header's menu); a pick
  goes through `app.pickCountry` (« ocn:country », the header's menu too), **which never builds the page again** (owner,
  2026-11-05: « Analyse de carte » was redrawn from scratch): a page that lists by country returns `onCountry` and takes the new
  country in place (« Analyse de carte »: its events, clubs, map; the other filters kept), a page whose content is the country's
  data (`COUNTRY_REDRAW`: `FR_ROUTES`, `needCountry`, the Agenda — its `carried` periods and filters —, the Documentation) is
  redrawn in place as for a switch of method (`redraw`: no loading screen, scroll kept), any other page is left as it is (a
  playback, « Direct » feeding a race, the Tracer…) — anyone may race abroad:
  a country's agenda, results and live races are open to every account, without CN (they are not ranked there); default the
  first accepted membership with data (`localStorage ocn.country` once picked); the Agenda's, Résultats' and En direct's lists
  keep the current country's (`country.of`: an item's `country`, France when it has none); a search on En direct looks in every
  country (no « Tous les pays » toggle since 2026-10-21). **Whose list** (owner, 2026-10-23): above the lists of Agenda,
  Résultats, En direct and Analyse de course a line gives the country's flag and name and « Choisir un autre pays », which opens
  the header's menu (`country.hint`, keys `cty.hint.*`); on a wide screen the header's two buttons say « Pays » and « Langue »
  (`.tool-label`, hidden under 640 px: both show a code, « FR » twice for a French reader). **One filter bar for the lists of
  races** (owner, 2026-10-23; `racefilters.js` `raceFilters`): Résultats, En direct, Analyse de course, Analyse solo (its race
  selector) and Analyse multi — Résultats' « Afficher » (its own), Spécialité, Région, Coureur, Rechercher (name, place,
  organiser), each field only when the page's races carry it, the state in the address (`f t reg r who q`; Analyse solo keeps
  its own address: `address: false`). The runner is chosen by a search (France's runners, France's lists), shown with a ✕
  that removes them, beside a choice « Tous | Mes courses » in the look of « Afficher » (owner, 2026-10-29: a lone « Mes
  courses » button looked chosen when it was not): no link to their page any more. Résultats alone opens on one's own races. En
  direct's region and runners come from the same race on « Résultats » (same day, same name words: `live.js` `sameRace`).
  **Registration and Réglages** (step 5): with `WORLD_OPEN` "1" the form asks for countries (`country.membershipFields`,
  up to 5, none required; `country.MEMBERS` mirrors `_lib/countries.js` `COUNTRIES`), else France's licence alone as before.
  Réglages › « Mes pays » (`#/reglages?onglet=pays`, the card `#st-countries`) lists, edits, leaves (POST `leave: true`) and
  joins; France checked with the account's own name; a change restarts the page (the data loaded goes). The licence alerts
  (results, start times) show only with a licence. **Admin** (step 6): « Comptes » has a Countries column; the duplicate
  licence check and the new-account mail skip accounts without a licence (the mail lists the countries). An account without a
  licence is in no Tracer team (`"".split(",")` gave `[""]`: the event list showed demo accounts every team-less event's
  title).
  **Tracer teams by invitation** (owner, 2026-10-20: for everyone, FFCO licensees included; no lookup by name, licence or
  e-mail — an e-mail lookup told whether an address had an account, names have homonyms): « Équipe et partage » makes a link for
  a role (`POST /api/tracer/<id>/invites`, 7 days, 20 at most, only its token's sha-256 kept in R2 `tracer/<id>/invites`;
  listed and revoked there); `#/orga-tracer?id=…&invite=…` opened signed in posts `/join` and the account joins under its own
  name (`{ uid, lic?, name, role, joined }`). The team's PUT only changes roles or removes members (nobody is added there);
  members added by licence before keep their place (`roleOf` and the list match uid or licence; R2 custom metadata `team` =
  licences, `uids` = account ids); account deletion hands an event to a uid member too. An encrypted event's passphrase is
  passed on separately.
  **Texts** (step 7): the privacy page (`content/privacy.*.js` `body(SITE, { world })`) and the home page's tour
  (`tourHtml(counts, { world })`, `tour.*.world`) read `/api/account/status` `world`: they say what is true on either side
  of `WORLD_OPEN`; the countries kept are listed either way.
- **Countries as modules** (owner, 2026-10-22: Spain the first after France, other countries to follow; plan
  `~/.claude/plans/happy-wobbling-lantern.md`): `countries/` — `base.py` (`Country`: code, federation, access rule, database,
  time zones, the federation's ranking), one module per country (`countries/fr`: FFCO's fetch `fetch(args)`, its agenda
  `refresh_agenda`), `registry()`, `write_index` (`site/data/meta.json` = `{ v: 2, countries: { FR: { access, federation, agenda,
  ranking, methods, seasons, counts… } } }`, public). **Each country's files in `site/data/<cc>/`**, the same names in every
  country (France's moved there once by `countries.move_legacy_layout`, run by `update.py`: a rename, retried — Windows' antivirus
  locks a folder of thousands of new files a while —, else copied); the countries' index and the provisional results
  (`site/data/prov/`) at the root. `update.py --out` is the root; `build_site`, `site_extras`, `site_eval`, `site_ask` take a
  country's folder (France's by default). The browser: `data.js` reads the loaded country's folder (`root()`,
  `loadedCountry()`, `useCountry(cc)` on a change of country: its own files, and `store.useCountry` swaps the per-country
  selection — compare, clubs, lastRunner), `data.site()` the index; `country.info/access/ranks`; `auth.sees(cc)` by the
  country's rule; the ranking pages (`app.FR_ROUTES`) need a country that ranks and that the account sees (`ranksHere`), else
  `needCountry` (« no ranking yet » for a country without one). **Runner ids** carry their country: `#/coureur/fr1234567`
  (`link.runner`, `data.parseId` / `fullId` / `localId`; a bare number, the links of before, is France's; a runner of another
  country in the address makes it the site's); the files keep the number alone. `auth.myId()`: one's own number in the
  loaded country (France's licence).
- **Spain** (`countries/es`, owner 2026-10-22; open to every account: its results are all public). **Agenda**
  (`countries/es/__init__.py` `refresh_agenda`, the daily agenda run; `site/data/es/agenda.json` in France's agenda shape with
  Spain's communities and provinces — INE numbers, `countries/es/places.py`): SICO (`countries/es/sico.py`, sico.fedo.org: the
  calendar from today on and, by its month filter kept in the session, the past months; an event's page: stages « Pruebas »,
  registration window, website, announcement PDF, the public entries counted by stage and category — names not kept, IBANs
  struck from the notes) merged with O-Replay's events of Spain (`ffco_scraper/prov/sources/oreplay.py`; country, else its
  time zone), one row per stage — a race SICO lists once per league (« FEMADO: E1 … / solo Madrid », « NACIONAL: E1 … ») is
  one (`merge_stages`) —, ids `es<SICO id>[-<stage>]` or `eso<O-Replay stage>`, `src` the event's pages (« Voir sur SICO /
  O-Replay »); past events are not read again (`FRESH_DAYS`); ~110 requests a day. SICO's home page also lists Spain's licensees
  (name, club, regional federation, SportIdent, licence; ~260 pages): not read yet (runner identity, plan step 5).
  **Résultats**: `races.sync_country` makes the agenda's races (`prov_races.country` ES, key = the agenda's id, `links` the
  O-Replay stage the agenda names; trail-O, rogaines, raids left out: `races.TIMED`); `run.look` reads `links["oreplay"]`
  (classes one by one — a whole stage times out —, status codes 0 ok, 1 dns, 2 dnf, 3 mp…, splits by control code from the
  readings, start times in the event's time zone; `tzdata` in requirements for Windows), liveresultat in the race's country's
  time zones (`run.time_zones`); the organisers' sites are not searched outside France (French words). A runner's SportIdent
  card (`model.runner` `card`, and `sex`, kept only when a source gives them) is never published (`build` drops it). OE12 HTML
  in Spanish (FEDO's « Pos / Nombre / Club / Tiempo », « Error en tarj. », « Abandona »: `oe_html._COLS`,
  `model.STATUS_WORDS`). The pages: Agenda's places, CN column, FFCO link and the « pending » filter follow the country;
  Résultats has no runner filter outside France.
- **Spain's rankings** (plan steps 4-11, 2026-10-22; computed daily, **published** since the owner saw the method measured
  on Spain's races: `countries/es/ranking.py` `PUBLISH`). `update._countries` (the daily full run, `COUNTRY_BUDGET`
  900 s; O-Replay's history an hour a night, `BACKFILL_BUDGET`, until `oreplay_backfilled`) runs
  `countries.es.ranking.update`: SICO's licensees (`licensees.py`, monthly, ~263 requests: name, club, regional
  federation, card, licence — never published), FEDO's ranking files (`official.py`, every season 2017 on: licence, category,
  total, M1/M2/M3, points race by race — Spain's « official »: M1 else M2), the Liga Española's results (`fedo.py`, OE12 HTML
  else PDF — the PDF reader knows OE12's Spanish columns since 2026-10-22, the Spanish championships are often PDFs only; a file
  unread is tried again when `fedo.READER` goes up —, the file's print date as the race's day), the provisional results' Spanish races (`archive.from_prov`), O-Replay's
  past events (`archive.backfill_oreplay`, 2024 on, a budget per run until done). The archive: `CN_DATA_DIR/es.sqlite3` in
  France's tables (`archive.py`: a race = a competition, classes with the same controls = one circuit, `categorie` normalised by
  `categories.py` with `cat_src` kept, `NOT_RANKED`/`prune` leave out score-O, rogaines, relays, phone orienteering, training
  camps and sessions (« Entrenamiento », « PNTD », « Tecnificación », « Concentración »: the national team's camp put a runner at
  25 440), school leagues (« Liga escolar »: children racing among themselves, outside the federation's races, as France's CN
  leaves school sport out), a runner's second run (« Name #2 », `REPEAT`) and, as « nc », a finish under a quarter of its
  circuit's median (`TOO_FAST`: a run cut short) and the non-competitive classes (`OPEN_CLASS`: « OPEN NARANJA », « Familiar »,
  « Iniciación »…, 6 % of the rows, even on a course shared with ranked classes: a 5-runner « OPEN ROJO F » gave 12 602); O-Replay's
  multi-day totals, stage type « Overall », are not races — `oreplay.is_overall`, left out of the stages, the agenda and the
  archive, those read before dropped once by `archive.drop_overall`; a race FEDO's file and another source both hold keeps
  FEDO's only, owner 2026-10-22 — `archive.dedupe`: half the finishers with the same name and time, the copies noted
  « dup:<course> » and never imported again); who is who
  (`countries/identity.py`: names word by word in any order, particles aside, a first name cut to 3 letters; a licensee by card
  or by the one name that fits, the club deciding; else a person of its own by name and club; `persons` / `person_keys`, stable
  numbers = the runners' ids, es<n>); clubs (`clubs.py`: `canonical` — a town before the club, « Independiente », regions'
  teams —, then a number and the regional federation's letters, « 0026FADO »; `names` for the build). The engine: `bootstrap`
  (`cn_engine.py`: the first season from each runner's first category's usual level against H21 as measured in France,
  `prior` = `ranking.category_level` / `CATEGORY_LEVEL` — an equal start left every category on one level, a 12-year-old above
  the elites, since Spain's categories mostly race on courses of their own —, then from their own first level; `days=None`,
  Spain's choice: the seeds never expire — FEDO's files have no sprint from 2020 to 2024, after which nobody held a sprint index
  to value a circuit again and the sprint and VTT indexes stopped), `title_weight` reads the league
  (`groupe`: Campeonato de España 2, Liga Española / nacional 1.5). **Spain's own parameters** (`Country.method_params`,
  `cn_engine.build_methods(overrides)`, also used by `build_site`): forest circuits valued on the fastest two-thirds; 2 races
  for an index, measured here first, France's rule too since 2026-10-23. The measure (2026-10-22, July 2025 - October 2026, the same runners, the scratch `es_eval.py` / `es_cmp.py` /
  `es_prior.py` kept in `C:\kerkia\Ozimut\work\scratch-scripts\C--kerkia-CO\4475af57-627e-4f46-9da2-48f0d9da2385\scratchpad`): two-thirds +0.41 forest, 2 races
  +0.67 sprint, both with the category start +0.52 forest [0.32, 0.71] and +1.70 sprint [1.04, 2.38] over France's settings; the
  category start costs nothing (forest +0.35, sprint −0.55 ns); a 24-month window −1.1 to −1.6; against FEDO's rule on the day
  (winner / time × 100 within the category, the best 6 of 12 months) +3.8 forest [3.4, 4.3], +4.0 sprint [2.9, 4.9] on the
  2024-2026 archive, and with everything above on the archive from 2018 (`final`) +5.0 forest [4.5, 5.4], +5.4 sprint [4.3, 6.5]; against
  FEDO's published previous-season M1 +12 (most of it the ranking's age). **Known limit**: the veterans' level against H21
  drifts up over the seasons (the archive from 2018: H65 0.89 of H21's median in 2026, France 0.72; H55 0.90, France 0.82; a
  70-year-old third in sprint; France's settings alike) — the ranking across categories, not the duels within a circuit. Not an
  error the races show (2026-10-23, the scratch `es_bias.py`): on circuits where they meet H/D 21-34, the share of duels the
  index gives the veterans minus the share they win: forest 35-50 +3.6 [−0.7, 7.2], 55+ +5.1 [−6.6, 11.1], sprint +0.8, −2.0, none
  significant (France's juniors +2.3 to +3.9) — Spain's « H21 » holds the recreational B classes, which lower its median. Left as it is.
  Categories read from the printed class (`categories.normalise`, again over the whole archive by `prune`): « M-18E », « INF
  MAS », « CAD FEM », « M-Vet 45 », « M-SE », school years (« F-3ºESO »); still unknown: course letters (« A », « B »), « U-10 »
  without the runner's sex, colour courses (9 % of the rows). A name first met with letters its file could not hold (OE2010's
  windows-1252 exports: « Micha? Olejnik ») takes the same runner's spelling from another source (`identity.resolve`). Every runner of Spain's races is ranked,
  visitors included (the top of the 2026 forest list: veterans of the Maximus O Meeting, who beat Spain's own by minutes).
  `build_site --country ES` (names from the country module, no anonymisation list or login
  index, `official` only when the country has values, meta `country`); `site_extras` keeps France's elite, cfc and evaluation
  to France. CI keeps the other countries' databases in the site state (`ci/state.py` `other_dbs`, `OTHERS_BEFORE`).
  **FEDO's ranking** is not a method but a table of its own (`official.site_table` → `site/data/es/official.json`, meta
  `official_table`, the index's `official_table`): each season's and discipline's table as FEDO publishes it — its race columns
  in its order, named from its legend by the longest code a column starts with (« CEOM » → « CEO ») —, each runner linked when
  Ozimut knows the licence; shown in Classement's tab « Classement FEDO » (`pages/fedranking.js`) and the runner's « Saisons »
  card. So Spain's method switch has Ozimut alone (`store.available` is the loaded country's `methods`, `useCountry(cc,
  methods)`; `store.get().method` falls back to it without overwriting the saved choice; the switch is hidden with one method).
  **The pages outside France** (`data.loadedCountry() !== "FR"`): no licence column or badge (Spain's numbers are Ozimut's), clubs
  by name not number, « Fédération régionale » for France's « Ligue », no départements, no « Carte » tab, no FFCO links, no
  relay simulator, no « Points nationaux », no Statistiques › « Territoires », no « IA » (France's tables, `FR_API`); one's own
  runner (« Ma page » → `fr<licence>`, the « me » row, « Mon club ») only in France's data (`auth.myId`). The Documentation
  says what differs (`doc.country.ES`). **Files packed** (Pages takes 20 000 files a deployment; France ~14k): meta `bucket`
  (r/ and net/: a runner's number // 10 in France, // 100 elsewhere, `site_io.runner_bucket`, `data.bucketOf`) and
  `club_packs` (67, a prime: 64 left 10 files empty and one with 162 clubs; club/ and club_courses/ in `p<n>.json` by a hash of the club's code, `site_io.club_pack` = `data.clubPack`):
  Spain ~1,250 files instead of ~7,500.
- **Canada** (`countries/ca`, owner 2026-11-11: « start with Orienteering Ottawa, then Canada in general », to show the clubs
  what Ozimut could be). Orienteering Canada's own site is behind a Cloudflare challenge (never worked around): the clubs are
  the sources. **Agenda** (`countries/ca/__init__.py`, `results=True`): WhyJustRun's events (`wjr.py`: whyjustrun.ca's open
  API, robots.txt allows all — `events.json`, the organisations' IOF XML list whose parents give each club's province:
  OABC, AOA, MOA, OO, OQ, ONB, ONS, SOA, YOA; Orienteering Ottawa's parent is OQ, `REGION_OF_CLUB` puts it in Ontario, its
  Gatineau Park events in Québec by name; the platform about twenty clubs use, no longer maintained) and the Quebec
  federation's calendar (`fqco.py`: courseorientationquebec.ca, WordPress « The Events Calendar » REST API; Ottawa's rows
  dropped there — WhyJustRun has them —, a WhyJustRun post of another club's event, « (Ramblers) Eastern Canadian… », kept
  only when its page links the results, else the organiser's row). Regions = the provinces (no finer unit, no places
  table: positions from the sources' coordinates). Meetings, AGMs, socials dropped (`NOT_EVENT`), trainings kind « e »,
  snowshoe-O its own discipline (« Raquettes », not ranked), « CANCELLED » after a name read. **Results**: each past race's
  `src` carries the club's own files of that day (`results.py`, the clubs' results pages read once a run: Orienteering
  Ottawa's `/Results/<yyyymmdd>_results.html`, MeOS split lists since January 2023 — robots.txt lists `/Results/` as closed,
  read all the same at a light pace, the owner's rule —, Ramblers' MeOS lists named by day), else what the WhyJustRun
  event's page links (WinSplits' database id, result files), looked at a few days after, then kept; `run.look` reads
  `links["wjr"]` (WhyJustRun's IOF XML result list) and `links["file"]` (the club's files, `parse_any`, `date_ok`).
  **MeOS's split list in HTML** (`parsers/meos_html._split_list`, `parsers.VERSION` 12): a class header « (n / m) », a runner
  row « 1. Elliott, Jesse · SI No · Time: 32:04 | MP | DNF », split rows « 3 (56): 4:28 (9:26) »; names turned round, the card
  kept (never published). **Ranking** (`archive.py`, `clubs.py`, `ranking.py`, as Spain's): CN_DATA_DIR/ca.sqlite3 from the
  provisional results' Canadian races (`from_prov`; an event with a file per format — the Eastern Canadian Championships'
  « Results-Long-by-Class.pdf » — split into a race per format), the clubs' past files once each (`backfill_files`, Ottawa's
  events named from WhyJustRun's calendar of their day) and WhyJustRun's past results of every Canadian club, newest season
  first, a budget per night until done (`backfill_wjr`, 2010 on); score-O, relays, Hallowe'en and family events, series
  totals left out (`NOT_RANKED`), Novice / beginner / group classes « nc » (`OPEN_CLASS`); runners told apart by their name
  alone (`identity.resolve` without clubs: Ottawa's files print none); clubs numbered once with their province's letters
  (« 0003ON », `ca_clubs`, WhyJustRun's organisations and the Quebec clubs, others numbered as met); the engine as Spain's
  (`bootstrap` with Spain's category levels — most of Canada's local races are courses by level: 0.75 —, seeds never
  expire). **The administrators' only for now** (owner, 2026-11-11, until the clubs have been asked): `countries/ca` `OPEN`
  True (False: the races out of « Résultats », `COUNTRY.results`, and no ranking files, `ranking.PUBLISH`) and a third access
  rule, « admins » (`countries/base.py ACCESS`, `functions/_lib/access.js` `DATA_ACCESS.CA`, `ADMIN_ONLY`, `adminOnly`): the
  login gate (`_middleware.js` `needs` → "ADMIN", `isAdmin`: ADMIN_EMAILS, as « Sites ») refuses `/data/ca/` but its agenda
  and Canada's race files of the provisional results (`/data/prov/[pub/]ca<…digit…>.json`) to everyone else, visitors
  included; in the browser `auth.sees` is the session's `admin` for such a country, `country.ranks` false for the others
  (« No ranking for this country yet »), `data.setHiddenRule` keeps `bootPrivate` from loading its runners, and `getProv`
  drops its races from the results index (the index still names them: race names and counts only). The calendar is
  everyone's, as the other countries'. To open Canada to all: `access="all"` in both places. The page word for its regions is
  « Province » (`f.region.CA`); the Documentation's note `doc.country.CA`. Measured locally on 2026-11-11: the archive 1,642 races 2010-2026 (Ottawa 85 files, Ramblers' lists, WhyJustRun 1,350 events with results of 3,474 asked), 43,526 results, 7,897 runners, 371 ranked in forest on the day, 744 site files; the index calls 77.2 % of forest duels right since 2012 (75.2 % since July 2025; each circuit weighing its runners, the index 15 days before; France about 81 %) — Canada's elite on top (McLaren, Smith, Harkavy, Kemp, Bergstrom).
  Letter to Orienteering Ottawa drafted (private doc https://claude.ai/artifact/N7qu8xM7zrU3wCa1vbXZxR).
- **FFCO's national calendars in the Agenda** (owner, 2026-11-05): the « Calendrier national » PDFs of FFCO's page
  `/les-pratiques/pratiquer-la-co/calendrier-national/` (the season's, the next ones « provisoire »: one-page tables of sub-groups B1
  and C1) are read by `ffco_scraper/natcal.py` in every agenda build (`agenda.build`: one page a day, a PDF only when its address is
  new — kept in agenda.json `natcal`, `VERSION`): the discipline from the block of the first column a row lies in (its merged cells
  are split by pdfplumber; the rules drawn, not the fills), dates « 23-janv. », « 13/14-mars », « 8 au 14 juillet », « 18 ou 25-août »
  (alternatives: `natcal.alt`), the organiser « 5703GE » / « CD73 » / « Ligue AR » as the agenda writes it (club names from
  `clubdir.json`). A row the agenda already lists — a course of the same days and discipline, by its organiser's number or half its
  name's words — is dropped; the others are events of kind « c » **without an id** (never a race of « Résultats », no alert, no
  organiser's pick), tagged « provisoire » (« calendrier national » for a season's final one), CN « — », the details saying what the
  calendar says (« sous réserve du retour d'expertise », « en attente de candidatures ») with the PDF; placed at their département's
  centre. On 2026-11-05: 31 rows of 2027-2028 added, 6 already on the agenda. Python code reading agenda events must keep requiring
  `e.id` for anything tied to a competition (races.sync, notify, the organisers' pickers do). **A reading that fails is kept**
  (owner, 2026-11-05: the 2027 calendar was missing on the site): the CI builds since they were added found none — `natcal: []`, no error
  kept — while the PC read all three; `calendars` now writes why in agenda.json `natcal_err` and the build prints « national
  calendars: … », and an agenda older than `AGENDA_VERSION` is rebuilt by any run (`update.main`), not only by a push's deploy run.
- **Agendas of 29 more countries** (2026-10-23; the agenda only, the owner's request: « for every IOF country, its calendar
  where a clean way exists »). The study (six research agents, every IOF member, each source fetched with our user agent; samples
  kept in the session's scratch): a clean source is a public API, an export (CSV, iCal) or a stable server-rendered list, read
  without a login or a key, never behind a bot challenge. **Read**: AT (ANNE's JSON API, anne-api.oefol.at), BE (O'Punch's JSON
  list, both federations; NL/LU clubs on it left out; its clubs' contacts and bank details never kept), BG (bgof.org's list), BR
  (CBO's JSON service, a month a request), BY (orient.by's year table), CH (o-l.ch's CSV), CZ (ORIS's JSON API), DE (OManager's
  CSV, upcoming only), DK (DOF's « Stævnekalender », upcoming only), EE (EOL's month view over the window), GB (British
  Orienteering's finder, ~40 pages a day), HK (OAHK's public Google Calendar, iCal), IL (ISOA's grid), IT (FISO's CSV: the year's
  filter is set in the session first), JP (Japan-O-entrY's list), KR (KOF's board), LT (the calendar page's embedded JSON), RO
  (FRO's JSON API), RS (OSS's ORIS year table), TR (TOF's FullCalendar JSON in its home page), UA (FSOU's month form, POST), ZA
  (SAOF's yearly TablePress page). **Not read**: SE, NO, AU, IOF Eventor, Eventor World (HK), PT (OriOasis), CA's federation
  (Cloudflare challenges; Eventor's API needs a federation's key — the clean way, ask them), NZ (SiteGround captcha), MD (403),
  HU (mtfsz.hu resets the connection), RU and KZ (orgeo.ru, rufso.ru unreachable), FI (IRMA, a Vaadin app; Navisport has an open API
  but holds the clubs' training series, not the calendar), LV (lof.lv: a private base64 RPC, robots « Disallow: / »); partial,
  left for later: US (OUSA's Google Calendar, national races only; EventReg), CA (WhyJustRun, a dozen clubs), NL (a hand-edited
  page), CY, CO, AZ, TW (a PDF); nothing found for MX, AR, CL, EC, UY, MT, GR, BA, ME, XK, UZ, SG, MY, TH, PH, VN, IN, PK, MN, KE, MA, TN, IS.
  **Code**: one module a country, `countries/<cc>.py` (`COUNTRY` with `results=False`: its races are not taken into the provisional
  results, `prov/run.py`; `read(http, today[, prev])`), on `countries/agenda.py` (`event()` the agenda's row — discipline and format
  read from names in a score of languages, Cyrillic, Japanese, Chinese and Hebrew included, the cancelled words taken out —, `ics()`,
  `abroad()`, `hooks()` = `refresh_agenda`, `agenda_path`, `agenda_current`, the file's `sources` naming the « Voir sur … » links);
  `countries.AGENDA_ONLY` lists them, `functions/_lib/access.js` opens their folders to every account. Sources that list only the
  coming events (DE, BE, DK, GB, JP, IL) keep the last weeks' from the previous file. The Agenda page: an event's `end` (dates
  « du … au … », kept in the list while under way), `level` (« Niveau »: the source's own level or series), no « no online entry »
  box when a source gives no entries, no second place filter when the regions have no subdivisions. About 300 requests a day for
  all 22, ~3 min (the 06:00 agenda run); each agenda's own `AGENDA_VERSION` rebuilds it.
  **Seven more the same day** (the owner: « add the partial sources too »): PL (PZOS's year page, one row a competition, the
  stages' disciplines by their icons; « WRE zagraniczne », World Ranking races abroad, left out), SI (OZS's year calendar: the
  icon gives the discipline and the level, « _1 » the league, « _2 » a national championship; « drugo » events and races abroad
  left out; « ODPOVEDANO », « PRESTAVLJENO » struck through), SK (SZOŠ IS's year list, 30 rows a page, its robots.txt's
  Crawl-delay of 10 s kept: `hooks(…, pause=10.0)`, ~1 min), IE (Orienteering Ireland's fixtures, upcoming only; club-closed
  events left out), and HR, MK, GE from OrienteeringOnline.net (`countries/oonline.py`: the search form's GET then POST with
  the country's number and the window, the date pickers' `$State` JSON needed; a full page of 30 cut in two; each competition's
  page read once, when first seen — last day, organiser, place, website, entry deadline; its e-mail never kept —, then taken
  from the previous file; only the competitions taking entries there). About 30 more requests a day.
  **Regions and finer units** (owner, 2026-10-24: « the region/state/province/land… for all countries where this makes sense, even
  a more granular level »; every agenda's `AGENDA_VERSION` 2, BR and UA unchanged): events carry `region` and `dep` as France's and
  Spain's, the file `regions` [{name, depts}] and `depts` {code: name} of those met (`agenda.places_of`; `order` for JP's regions).
  A town, forest or park is placed by `countries/places.py` `locate(cc, text, expect=, region_only=)` on a table a country,
  `countries/places/<cc>.json.gz` (folded name → candidates [region, dept, log weight]), made **offline** from GeoNames (CC BY 4.0)
  by `tools/gazetteer.py` (`fetch` into `$CN_DATA_DIR/geonames`, `build [cc…]`; the levels, local names and renames per country in
  its `UNITS`/`RENAME`; names indexed in the calendar's script only; ~6 MB in all): no geocoding service at run time. The text is
  read part by part (postcode + town kept, a street and number dropped, « обл. » / « р-н » / « St. » written out, another country
  named → not placed: `agenda.abroad_of`), a whole part outweighing a word inside one, a bigger place a smaller; a name met in
  several regions is settled by the calendar's own region (`expect`) or not placed. `hooks(place=…)` places every row at each run,
  the past rows kept from the previous file too (even of an older version); a row still unplaced takes the region of all its
  organiser's other rows (`_by_org`, two at least). Per country: **AT** Land / Bezirk (« Graz (Stadt) », « Innsbruck (Land) »), the
  host's Land as `expect`; **BE** region (Bruxelles / Wallonie / Vlaanderen) / province, Flanders' federation → Vlaanderen when
  unplaced; **BG** oblast from the event's name only (clubs' names are villages too); **BY** oblast / raion from the place, the
  calendar's « Общереспубликанские » / « Международные » moved to `level`; **CH** the regional association (the CSV's own « region » column, always kept, even when the canton is another
  association's: Ticino's « Roveredo GR ») / canton by its
  letters: first from the CSV's own Swiss grid coordinates (`coord_x`/`coord_y`, LV03 or LV95, → `gps` by swisstopo's formulas,
  `ch.wgs84`; the CSV has no canton column, nor the event's page) against the table's `points` — every populated place's position
  and canton (`gazetteer.POINTS`), the 5 nearest within 8 km voting by 1/distance, `places.nearest`; 45 of 183 events on
  2026-10-24, the coming ones mostly without coordinates yet —, else letters after the place or after it in the name
  (« Roveredo GR »), else the name, else a word of the place or the title that is a village of the event's own association
  and of one canton there, a forest named after its village (« Allschwilerwald ») included (`ch._by_word`: « i.d.R. Magglingen »,
  too small a village for `locate`; a canton named in the title, « Basler », not taken) (145 of 183 with a canton; forest
  names such as « Bohärdli » are in no gazetteer); **CZ** kraj / okres, ORIS's section → its kraje
  as `expect` (one kraj: the region when unplaced); **DE** Land / Kreis (« Landkreis X » kept beside a city X); **DK** DOF's kreds (as the
  calendar) / kommune; **EE** maakond / vald or linn; **GB** British Orienteering's association (as the calendar) / county or unitary
  authority, the nation as `expect`; **HK** area (香港島, 九龍, 新界) / district, venue else name; **HR** županija / grad or općina; **IE**
  province / county (the calendar's county); **IL** district only (subdistricts not in Hebrew); **IT** region / province by FISO's
  « (TN) », else by name (the organising committee is not the place's); **JP** 地方 / prefecture (the calendar's); **KR** province /
  si-gun-gu; **LT** apskritis only; **MK**, **SI** the municipality (their first level; Slovenia's statistical regions are not in
  GeoNames); **PL** voivodeship of the organising club's town (« UKS Azymut 45, Gdynia »: the list gives no place), no finer unit;
  **RO** development region / județ by its letters; **RS** statistical region / okrug; **SK** kraj / okres; **TR** geographical region
  (Marmara, Ege…) / il; **ZA** province / district or metro; **GE** region only; **BR** state and **UA** oblast as the calendars give
  them. Placed on 2026-10-24: AT 115/139 events (100 with a Bezirk), BE 189/211, CH 183/183 (145 cantons), CZ 232/307, DE 109/126,
  GB 822/836 (747 counties), IT 162/162, JP 110/126, EE 100/128, IL 30/83, BG 12/34, PL 34/40, HK 12/54 (most without a venue).
  The Agenda page: each country's level names (`agd.region.<CC>` / `agd.dept.<CC>`, else « Région » / « Province »), a unit whose
  code is its name shown once, a short code in brackets, a name after « · », nothing when the place already says it (« (TN) »);
  the region its own column after the place, named as the country's level (« Association régionale » in Switzerland, the
  calendar's own column, « Land »…), under the place on a phone (owner, 2026-10-24: shown even where no finer unit is known).
  The filter bar's click handler took `<body data-group>` for a group chip: any click in the filters emptied the list (fixed).
- **« IOF WRE »** (owner, 2026-11-04: « a special country named IOF WRE », first in the country menu after the account's own
  countries): the IOF's World Ranking Events as one more agenda, `countries/wre.py`, code **XW** (ISO 3166's user-assigned range;
  `country.WRE`; its name `cty.wre`, a globe drawn in place of a flag, « WRE » on the header's button; `access` "all"). Source: the
  IOF World Ranking site's calendar (`ranking.orienteering.org/Calendar?year=&discipline=F|FS|M|S|T`, server-rendered, no bot
  challenge nor robots.txt, unlike IOF Eventor): date, host (the IOC's code, `IOC` → ISO), name, the World Cup badge, the status;
  each WRE links its IOF Eventor page (`src.eventor`, owner 2026-11-04: venue, website, entries for the reader's browser — the
  ranking site numbers events as Eventor does, a split event 1 000 000 / 2 000 000 + the number; Eventor screens robots, Ozimut
  reads nothing there; an Eventor API key is asked of the IOF); **Eventor's own list, copied by hand** (owner, 2026-11-08): `countries/wre_eventor.tsv` holds
  Eventor's event list as the owner pasted it from their browser (Eventor answers robots with a Cloudflare challenge: never
  read nor rendered by Ozimut); `wre.eventor_rows` reads it (Eventor writes « 10 Oct » without a year: the first row's year
  nearest the « # copied: » day, then the next year each time the month falls back by more than two; a cell of several lines
  — « World Ranking Event » / « Gold WRE » — as its lines; organisers by English name, `EVENTOR_HOST`), `wre.pair` matches
  each event to the ranking calendar's row (same host, discipline and day — any day of a multi-day event, which then covers
  every row of its days sharing a word —, one row each), copying Eventor's level and entry deadline (`reg.close`, no link)
  onto it; the rest are rows of their own (`xwe<hash>`, `src.eventor` the list page; « (Preliminary Dates) » becomes
  `prelim`, the tag « dates provisoires »). On 2026-11-08: 265 rows to December 2029, 122 matched, 143 added (the WREs from
  May 2027, the championships, the World Cup rounds). To update it, paste the list again and change the date.
  this year and the next (the last too until March), one row per event (its men's and women's lists are two rows there), ~10
  requests a day; `countries.modules()` runs it **last** in the agenda run so that each WRE is matched to its host country's agenda
  as refreshed that day (`match`: a competition of that day or spanning it, the same discipline, sprint apart from forest except a
  multi-day row; the most name words shared, a name saying « WRE » counting two; with none shared, the day's only competition
  unless its format is known and another — measured 2026-11-04 on the local agendas: 61 of 191 matched, the misses mostly
  2027 events the host calendars do not list yet); the match's id is kept (`same`) with its place, organiser, website, entries.
  The index's XW entry lists its `hosts` (`countries.summary`), which the menu offers (`country.withData`). The Agenda page
  (`pages/agenda.js`): in XW's list the host's flag and name in a « Pays » column and in the details (no link to the host's list:
  owner, 2026-11-04 — the details already carry what its row has); in a host's list the matched row tagged « WRE » (`.tag-wre`), « Coupe du
  monde » for a World Cup round, the unmatched WREs added as rows of their own (no FFCO link, no « no online entries » box) — a
  country whose calendar Ozimut cannot read (Sweden, Norway, Finland, Australia…) gets an agenda of its WREs alone. **Maps**
  (owner, 2026-11-04: « Australia has no map », « for IOF WRE, a world map »): `tools/countrymaps.py build` makes an outline for
  every country the WRE calendar may name too (`wre.IOC`), and `geo/xw.json`, the world's land (`build_world`: every country's
  rings, Antarctica out, 83 KB); a WRE without its match's position is placed by a town its name gives — the host's own table of
  places when Ozimut has one (the name's generic words taken out first: « JK Day 2 - Middle » found a « Middle… »), else
  `countries/places/world.json.gz` (`tools/worldplaces.py`: GeoNames' towns of 5 000 people or more, Natural Earth's label point
  as each country's centre, 711 KB) — else at its country's centre, an approximate place; positions written after the change
  check (`wre.POS`, `place_all`: `comparable` leaves them out); the legend says « au centre du pays » for IOF WRE and a WRE-only
  list (`agendamap.mount`'s `area`, `agd.map.areaCountry`). A country's centre is the label point of its largest Natural Earth
  feature (France's code also covers Clipperton Island: « Nationale moyenne distance » sat in the Pacific), and a position off the
  country's map frame (`wre.inside`, the frame of geo/<cc>.json) falls back to that centre, else to the frame's.
  **The Agenda's table sorts by any column** (owner, 2026-11-04, in place of a country filter for IOF WRE; every country's list,
  as the admin's usage tables): a click on a heading sorts by it (again: the other way), Shift + click adds a further key, then
  reverses it, then takes it out (`sortBy`, `sortHead`, `agd.sortHint`); the date's order breaks ties; kept for the visit
  (`sessionStorage ocn.agd.sort`); another order than the date's opens the list at its top.
- **The Agenda's map** (owner, 2026-10-25: « on a computer, a map of the chosen country, the competition's place shown as soon as
  the mouse is over it in the table, all the more once it is selected »): above the details (`.agenda-side`, sticky; hidden and
  not fetched under 980 px), `site/assets/js/agendamap.js` draws the country as SVG from `site/assets/geo/<cc>.json` — Natural
  Earth's 1:10m countries and first-level units (public domain), the land around the largest piece (overseas left out), the
  neighbours cut to the frame, simplified to ~a pixel, ~10-70 KB a country, made once by `tools/countrymaps.py` (`fetch` into
  `$CN_DATA_DIR/naturalearth`, `build`): no map service is asked anything. Every event of the table is a dot (one per place), the
  row under the mouse (or focused) and the selected event in the control flag's orange with their place's name; a dot shows its
  events on hover, a click selects them in turn (the row tinted `map-hover`); wheel or + − to zoom, drag to move, ⤢ the whole
  country; a selected event outside the view is brought into it. **Positions**: the organiser's `gps`, else `pos` [lat, lon] —
  its town, from GeoNames — or [lat, lon, 1], its finer unit's (else region's) centre, drawn hollow and dashed («  lieu
  approché »). `countries/agenda.py` `add_positions` (`places.position`: the place, else the event's name, within the event's
  unit — its code, else its name, Spain's INE numbers; a name of two places over 15 km apart in the unit is no town; a town
  before a unit of its name) runs after every agenda refresh and once on a file of an older `POS_VERSION` (`update._agenda`,
  `_agenda_positions`, the deploy-only run too); `comparable` keeps positions out of the « changed? » checks (hooks, Spain's,
  FFCO's `_digest`). The places tables carry the positions since (`v` 2, tools/gazetteer.py: a candidate's town to ~1 km, a 6th
  field 1 for a unit's centre, `rpos` and the depts' centres = the mean of their towns; the placement data unchanged, checked
  table by table) and France (régions, départements by number) and Spain were added for it. Measured 2026-10-25 on the local
  agendas: France 1 810 events by town, 28 by GPS, 172 at a centre, 10 not placed, of 2 020; Britain 752 / 28 of 836;
  Switzerland 45 GPS, 87 town, 51 centre; Poland 1 town (its list gives only the club's voivodeship). Lakes are not drawn.
- **No FFCO for those outside France** (owner, 2026-10-20): a visitor or an account that has not joined France never meets
  « FFCO » outside the site's rules (privacy page, « Indépendance et sources »): the home page, the footer, the shared pages
  (Agenda, Résultats, En direct, Réglages, registration, the Tracer, the organisers' deposits) and the e-mails speak of « la
  fédération », « officiel », « là où Ozimut a les résultats de votre fédération »; the CN column and tags show with France only
  (`auth.sees("FR")`). Exceptions: the France option's own licence field (« Numéro de licence FFCO », once France is chosen),
  the France-only pages, links to FFCO's own pages, and the Ozimut method's tab and study (validated on France's results). The
  country is chosen in the header only (always shown). The footer holds only the rules' link and
  the counts: the site's independence is said in the rules (owner, 2026-10-20). **The Documentation shows what the account
  sees** (owner, 2026-10-20): without France no « CN officiel » tab, and « Les calculs du site » keeps only the split times
  (`fr` passed to `content/methods.*.js`: `TABS`, `SITE_CHAPTERS`, the lede, the note); the Ozimut method and the study stay.
- **Competitions declared by their organisers** (owner, 2026-10-20: non-France organisers post their own competitions, start
  lists and results under their country). France's competitions come from FFCO's calendar; elsewhere an account with an accepted
  membership (France apart) declares one under « Organisation » — the card « Mes compétitions déclarées » (`site/assets/js/declare.js`)
  on Résultats, Horaires and Compétitions: country, club (the membership's by default), name, date (60 days back to ~13 months
  ahead), place, discipline, format, website. `functions/api/declared.js` (GET mine — an administrator's: all —, POST, PUT, DELETE =
  status « removed »; 20 a day) keeps it in R2 `declared/<id>.json` (`_lib/club.js` `DECLARED`, `loadDeclared`, `declaredRace`), race
  key `d<id>`, and starts a `prov` run. **One lookup and one organiser rule for every competition key** (`_lib/club.js`): `findRace`
  (a `d` key from its declaration — who declared it is never published —, else « Résultats », else the agenda's `a<id>`) and
  `organises` (an administrator; for a declared competition the account that declared it; else a member of the organising club),
  used by uploads (results — organiser only for a declared one —, start lists, courses), the multi analyses and the Tracer. An
  upload's meta.json carries the declaration (`declared`), so `sources/upload.race_for` adds a race the run has not seen yet. CI
  syncs `declared/` to `$CN_DATA_DIR/declared`; `sources/declared.py` upserts `prov_races` (column `country`, added by
  `store.connect`; NULL = France) and drops removed ones with their documents. `run.build`: declared races listed up to
  `ORG_START_DAYS` ahead even without a start list (index `country`, `url` = their website), their runners never matched to French
  licences nor scored (`foreign`); `races.merge_duplicates` only merges France's. Pages: the Agenda adds the index's coming `d` races
  as events of their country (`declaredEvent`: no registration box, no FFCO link; France's regions, départements and CN filter only
  when the country is France); the organisers' lists, the deposit and the Tracer's competition picker add the account's declared
  ones. The site's country menu offers the countries with data and those the account has joined (`country.withData`), the first
  joined by default. The race page shows France's CN notes, « ? » marks and scores only to France's members on a French race (`CN`).
  The privacy page says what a declaration keeps. Tested 2026-10-20 locally (a Swiss account: declare, start list, results, Agenda,
  Résultats, analysis, Tracer; France unchanged) and the pipeline on a database copy.
- **Admin › « Consommation »** (owner, 2026-10-20; `functions/api/admin/consumption.js`, `?onglet=consommation`): the free
  plans' use against their limits (`LIMITS`, checked by hand — change them there), the last 30 days as bars under the limit.
  E-mails and accounts from D1 (`mail_log` is never pruned); the rest from Cloudflare's GraphQL analytics and REST API —
  `workersInvocationsAdaptive` + `pagesFunctionsInvocationsAdaptiveGroups` (requests), `durableObjectsInvocationsAdaptiveGroups`,
  `aiInferenceAdaptiveGroups` (neurons), `d1AnalyticsAdaptiveGroups`, `r2OperationsAdaptiveGroups` (class A/B by action),
  `r2StorageAdaptiveGroups`, the D1 list's `file_size`, the Pages deployments of the month — each asked on its own, a failing
  one shown « indisponible » with its error. Needs the Pages secret `CF_ANALYTICS_TOKEN` (read-only: Account Analytics, D1 and
  Pages: Read; the owner's), optionally `CF_ACCOUNT_ID`; without it only D1's figures show. The dataset and field names were
  written from Cloudflare's documentation and not yet run against a real token.
  **« Robots »** (owner, 2026-11-01; a card under the table, `drawRobots`, `GET /api/admin/robots?days=30|90|365`): the AI bots
  Cloudflare blocked or let through (the zone's « AI Crawler and Agent access policies »: Training and Agents blocked, Search
  allowed) and the guest passes, from **Ozimut's own copy kept 13 months** (Cloudflare keeps 31 days): D1 `bot_daily` (day, bot,
  action — Cloudflare's, or « allowed » —, source, n), `bot_recent` (the last day's AI requests acted on, 100 at most: time, bot,
  path, country, never an address), `guest_daily` (passes given, failed, reads refused without a pass — the gate counts those in
  the isolate and writes at most once a minute, `countRefused`), `bot_sync` (the copy's state); migration 0020. `_lib/robots.js`
  `syncBots`: every 3 hours (asked by `/api/track`'s `robotsSoon` and by the card), a few UTC days a pass from the last one copied
  (the first passes fill 30 days), each day's security events by `firewallEventsAdaptiveGroups` (else the raw events, a page,
  marked approximate) sorted by user agent (`_lib/aibots.js`, the robots.txt list) and the AI requests answered under 400 by
  `httpRequestsAdaptiveGroups`; each dataset's limits from the zone's `settings` node; queries with literal filters. Needs
  `CF_ANALYTICS_TOKEN` with « Zone › Zone › Read » and « Zone › Analytics › Read » on ozimut.com (the zone from `CF_ZONE_ID`,
  else found by name); written from Cloudflare's documentation, not yet run against a real token.
- **Third-party code is served by the site itself** (owner, 2026-10-18: Safari reported cdn.jsdelivr.net as a tracker; no
  public CDN since): ECharts, pdf.js, pdf-lib, fontkit, fflate, proj4, the countries' flags (flag-icons' 4:3 SVGs, `vendor.flag`;
  `python tools/vendor.py build <package>` rebuilds one package alone), DuckDB-WASM (its browser module bundled with
  apache-arrow by esbuild) and the fontsource fonts (Roboto, Roboto Condensed, Noto Sans JP / TC / HK: their CSS and the .woff
  files the Tracer reads) live in `site/assets/vendor/<name>@<version>/` with their licences, built from npm by `tools/vendor.py`
  (`build`; nothing of a package's install scripts runs); files over Cloudflare Pages' 25 MiB are split in two parts that
  `vendor.joined` puts back together (DuckDB's engine, 34 MB). The code takes every path from `site/assets/js/vendor.js`
  (ECharts' too since 2026-11-06, see « The launch »). **Check for updates regularly** — at least monthly, and whenever a library's security advisory
  comes out: `python tools/vendor.py check` lists newer releases; to update one, change its version in `tools/vendor.py`,
  `build`, change it in `vendor.js`, test the pages `vendor.js` names for it, commit. Major
  versions need reading their changelog first (pdf.js and DuckDB change their APIs). Never add a `<script>` or `import()` from
  another host: vendor it.
- **The launch** (owner, 2026-11-06: a phone showed nothing for a while before « Chargement… »): `index.html` paints its loading
  screen as soon as it arrives — its few rules inline (`#boot-css`), in the theme's colours (`--boot-bg`, `--boot-ink`,
  `--boot-grid`, set by the theme script) —, `app.css` loading beside it without holding the first paint (`media="print"` switched
  on load, a `preload` for its priority); `app.styled()` waits for it before anything is drawn, then drops the inline rules.
  **ECharts is no longer in `index.html`** (its megabyte was compiled before the app started): `charts.loadECharts()` loads it and
  the reader's locale once; the router waits for it beside a page's module (`app.route_`), except for the first page of a visit
  when it is one of `NO_CHARTS` (the landing pages, checked to draw no chart: the modules page, the home page, the Agenda,
  « Analyse », « Analyse solo »… — add a page there only after checking it), and starts it once that page shows; `geo.js` waits for
  it before registering a map. The catalogues load together (`i18n.js`: French, the reader's, English beneath German and Spanish —
  they came one after the other).
- **The move to ozimut.com** (owner, 2026-10-19; plan: private artifact https://claude.ai/artifact/HQuwgQwKg9nexvGioSK77M).
  The name « Ozimut » is written with a capital O, the rest lower case, and **its O in the control-flag orange** wherever it
  is drawn (`.brand-o`, the e-mails' header, the reel's `.rv-logo-o`); tagline « La course d'orientation, en cartes et en
  chiffres » / "Orienteering, in maps and numbers". Everything a browser keeps belongs to one address, so the old one keeps
  serving the whole site (data and API too: a page held there must still work) and **its pages send visitors on**
  (`assets/js/bridge.js`, called first by `app.start`): `leave()` on an `OLD` host reads an allowlist of localStorage
  (`KEEP`: theme, state, language, navigation memory, the tools' prefs, calibrations, relay, VMA, games, the Tracer's field
  queue; `NEVER`: `ocn.liveBase`, `ocn.ia.byok`, `cnx.session`), asks `/api/account/handoff` for a one-time token when
  signed in (signed with `SESSION_SECRET|handoff`, so never a session cookie; 60 s; used once — D1 `handoffs`, migration
  0013), and opens `https://ozimut.com/#oz=<deflate-raw, base64url>` (the fragment never reaches a server; calibrations
  dropped first past 60 000 characters); `arrive()` on the new address takes the payload out of the address at once,
  stores the settings it does not have, redeems the token (`auth.handoffLogin`), reloads on the page asked for. A browser
  whose Tracer still has saves or photos waiting (IndexedDB `ocn-tracer` « pending », « photos ») stays on the old address
  under a line saying why (`.bridge-note`). `OLD_HOSTS` (wrangler.toml) is the server's list (the hand-off issues tokens only
  there); push: `push_subs.origin` (migration 0013), a device subscribing again on the new address drops its old
  subscription of the same label. Local test: `OLD_HOSTS=localhost` and `SITE_URL=http://127.0.0.1:<port>` in `.dev.vars`,
  `localStorage["ocn.bridgeTo"] = "http://127.0.0.1:<port>"` on localhost. Internal names stay: Pages `observatoire-cn`, D1
  `ocn`, R2 `cn-state`, Worker `ocn-live`, the `ocn.*` / `cnx.*` browser keys, the method key `top6w`.
  **Switched on 2026-10-19 evening** (`bridge.ACTIVE` true, 348a5a5; before it, false moved only `?demenagement` visitors).
  The window about the move (`moved.js`, D1 `users.moved_notice` 0 = to show, set for the accounts of before the move) shows
  once on the new address. Mail goes from alert@ozimut.com (the Resend key's domain is « All domains »), replies to
  contact@ozimut.com (Proton). The ozimut.com zone's Browser Cache TTL is « Respect Existing Headers »: its default (4 h)
  overrode Pages' `max-age=0` on `/assets/` and kept old modules after a deploy. ocn.kerkia.com stays attached indefinitely.
- GitHub may occasionally fail runs on its own (e.g. "job was not acquired by Runner"): check
  githubstatus.com before suspecting the code; the next hourly run catches up.
