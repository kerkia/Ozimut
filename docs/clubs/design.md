# Clubs, entries and club accounts — design

The contract for Part D of the study of paid plans (`C:\Kerkia\Ozimut\work\study\payments`, owner 2026-11-22: « build the whole of
part D now »). **Change it first, then the code.** Every payment stays outside Ozimut: transfers between people and clubs, cash
or cheque at the desk. Ozimut says who owes what to whom, keeps what was marked paid, and draws up the statements.

Migrations: `0030_orgs.sql` (clubs, members, settings, invitations, netting, map library) and `0031_entries.sql` (entry forms,
entries, references, the clubs' ledger). Every route answers `503 { error: "not ready" }` before its migration is applied
(the pattern of `api/booking`: catch `no such table|no such column`). The booking tables of 0023 are no longer used (the owner:
never used for real); `booking_runners` stays as « Mes coureurs ».

## 1. Orgs (clubs, committees, leagues, federations)

An **org** is `orgs` (cc, kind, code, name, parent, state). France's orgs mirror the federation's tree read by
`ffco_scraper/prov/clubdir.py` and published as `site/data/fr/clubdir.json` (leagues → committees → clubs): a row is created
**lazily** the first time anyone needs it (`orgByCode(..., { create: true })`), code = the directory's key (club « 0109 »,
league « AR », committee « 69 »). Elsewhere an org is **declared** by a member (name, country), unclaimed until an
administrator confirms its first manager.

### Roles

`org_members.roles` is a comma list of `manager`, `organiser`, `mapper`, `treasurer`; a row in state `ok` makes a member.

| Right (`can`) | Who |
|---|---|
| `manage` | manager — the club's settings, roles, invitations, netting, removing members |
| `organise` | manager, organiser — creates the club's events, links them to the calendar at once, on their team by default |
| `map` | manager, mapper — the club's map library |
| `treasure` | manager, treasurer — amounts due, payments marked, statements, the ledger, the year-end bills |
| `member` | any member in state ok (guests until their `until`) — the members list, the club's events, the map list |

Administrators (`isAdmin`) pass every right. A club's last manager cannot leave or be removed without naming another.

### Membership

- **France, automatic**: an account whose licence's club is the org (`_lib/club.js clubOf`: the club of its latest race) is a
  member, `source = federation`. `syncFederation(env, request, user)` runs from `/api/account/me` at most once a Paris day
  (`users.org_checked`): it upserts that row, and when the licence's club changed it removes the old federation row (roles
  kept on a row only while its source is not `federation`; a manager who moves club loses the old club's roles).
- **Declared** (outside France, or a club not read from the results): the club in Réglages › Mes pays (`user_countries.club`)
  or a request from « Mon club »: a pending row a manager confirms.
- **Invited guests**: `org_invites` links (token hashed, a lifetime, roles, an end day); joining makes a row `source = invited`.

### Claiming a club

« Gérer mon club » asks to become a manager (`POST /api/orgs/claim`):
- **France: an officer** — the account's first and last name match an officer listed with the role « président(e) »,
  « secrétaire » or « trésorier / trésorière » for that club in `fr/clubdir_contacts.json` (`C[code].bureau`: [name, role],
  names compared folded, word order free): manager at once (`source = claim`, state ok), the org `claimed`. Two officers
  may both claim: both become managers.
- **Anyone else, and every org outside France**: a pending claim an administrator confirms or refuses (admin page, tab
  « Clubs »). A dispute also goes to the administrators.

### States, as built (2026-11-23)

- A pending claim is the pseudo-role `claim` on the account's row; the member stays `ok` meanwhile.
- A member removed, or a federation member who left, is kept in state `left`, so the daily sync does not add them back.
- A calendar link waiting for the club's managers is `events.link_state = "club"`; the events API shows it as
  `linkState: "pending"` with `linkWait: "club"` and the `org`. `GET /api/events?org=<id>` lists a club's events to its members.
- `GET /api/tracer` returns `clubs` (the clubs one organises); each group of `orgGroups` keeps its club's `name`.
- Events made before 0030 get their `org_id` when a club's events are first listed (by club number).
- When a club's last federation manager moves to another club, the club has no manager until a new claim is confirmed.

### Settings (`org_settings.json`)

```
{ events_by: "organisers" | "members",          // who may create the club's events (default organisers)
  default_team: true,                          // the club's organisers are on its events' teams (resolved at read time)
  entry_policy: { mode: "self" | "champ" | "all" | "case", except: [event ids], include: [event ids],
                  recover: false },            // see §4
  iban: "", holder: "", bic: "", contact: "" }  // shown only to those who entered or owe the club
```

### In the existing tools

- `events.org_id`: set at creation from `orgCode(events.club)` (France) or the creator's club membership; `canManage`
  (`_lib/events.js`) also passes an organiser of `events.org_id` when its `default_team` is on — **resolved at read time**,
  never copied into `event_members`. With no claimed org, today's rules stay unchanged.
- Linking to the calendar: an organiser of the competition's organising org links at once (`link_state` verified).
- Event creation: when the club's `events_by` is `organisers`, a non-organiser member's event for the club is still made,
  but its calendar link waits for the club's managers (not an administrator) — `/api/events/<id>/link` answers `pending`
  and the managers see it in « Mon club › Événements ».
- Analyses « réservées au club »: an `ok` member of the org (as well as today's clubOf rule) opens them.
- The Tracer's and Cartographier's teams: « les organisateurs du club » / « les cartographes du club » as a group added to a
  document's team (`meta.orgGroups: [{ org, role }]`), resolved at read time; invitation links stay.
- Stats › Clubs › « Mon club » links to « Mon club » (#/monclub).

## 2. The club's maps

`org_maps` + `org_map_versions`; files in R2 `orgmaps/<org>/<map>/v<version>/<file>`, a viewing copy `…/view` (WebP ≤ 2 560 px)
and a thumbnail `…/thumb` as Mes cartes makes them (`trace/mapfile.js`, `MM.viewCopy`). A map is either files sent (OCAD,
Mapper, PDF, image with georeference — kept byte for byte) or a Cartographier document linked (`carto_id`).

| Right | manager | mapper | organiser | member | guest link |
|---|---|---|---|---|---|
| see the list | yes | yes | yes | yes | that map |
| see the map (view copy) | yes | yes | yes | thumbnail | yes |
| download the file | yes | yes | no | no | if the link says so |
| use for an event (lent) | yes | yes | yes | no | if the link says so |
| edit, new version | yes | yes | no | no | no |
| set rights, embargo | yes | its maps | no | no | no |

`access` overrides per map. **Embargo** (`embargo_until`): members see the map exists and its end day, not the map; the teams of
`embargo_ok` events may use it. **Rights written down** (`rights`): course setting, analyses open to runners, Pixel, a public
thumbnail — each a manager's tick with name and date; Pixel uses a club map only with `rights.pixel` (the owner's rule).
Club maps never enter the administrators' collection (`_lib/maplib.js`). « Une carte du club » is offered by the Tracer's
« Nouvel événement », the map analysis's circuit editor and Pixel's « Nouvel événement » (and an existing Pixel event's page):
the tool receives the file (lent: the Tracer's `lent` flag for organisers) and records `{ org, map, version }` as its source; a
new version lists the events using the old one.

**A Cartographier document linked** has no stored file (owner, 2026-11-23: it must reach the tools all the same): the browser
writes it as an OCAD file, as Cartographier's « Envoyer au tracé » does (`orgmapuse.js cartoFile` → `mapper/ocadout.js`
`writeOcadDoc`, the OCAD file it came from carried through), from `GET …/maps/<id>/carto/doc | /carto/source` — served to those
who may download the map, use it in that tool, or edit its card, whether or not they are on the Cartographier team. The tools
receive the map as it is the day they take it (`usable` lists it with one virtual file « <name>.ocd » and the document's
version). Its viewing copy and thumbnail are made from that file when it is linked and again by « Mettre à jour l'aperçu »;
those allowed download it with « Télécharger en OCAD »; its georeference and place come from the OCAD file's grid when the card
has none. A document deleted in Cartographier: the map leaves the tools' lists, the card says so.

## 3. Entries

An event of kind competition or public training (not a relay yet; a club training only when its team switches entries on)
has an **entry form** (`entry_forms`) and **entries**. The Orga tab « Départs » becomes **« Inscriptions et départs »**
(tab key `departs` kept), three steps: Inscriptions → Horaires → Liste de départ; it stays readable after the race day.

### Who enters, from where

- **Arena**: the competition's details offer « S'inscrire » (open form) → `#/inscription?ev=<event id>` (also reached by
  `#/horaire?course=<race key>`); « Mes inscriptions » `#/mes-inscriptions`.
- **Signed in**: for oneself and « Mes coureurs » (`booking_runners`: adults the account enters, no proof asked, as today) and
  **one's child accounts** (`track_guardians`: the owner's rule for minors — a child is an account managed by its parents;
  the entry form can create one: first and last name, year of birth, club; `users.child = 1`, a guardian row; no e-mail, no
  password, `CHILD_DOMAIN` address), whatever `TRACK_OPEN` says (tracking stays the administrators').
- **Not signed in — registration blended with the entry** (owner, 2026-11-22): the form asks first and last name, e-mail,
  a password (« to find your entries later »), the club, the consent, Turnstile; it creates the account exactly as
  `/api/account/register` does (shared function) and the entries in state `pending`; confirming the e-mail
  (`api/account/verify.js`) turns them `entered`. A pending entry holds its place and start; it is shown to the organisers
  (marked) and not in the public list. An address that already has an account is asked to sign in.
- **The organisers**: by hand, or an import read in the browser (any CSV with a header row and OE's CSV — Chrono's
  `io/oecsv.js` readCsv —, IOF XML EntryList — `io/iofxml.js` —, a Google Sheet through `/api/sheet`), sent as rows. Many
  clubs manage entries themselves rather than on the federation's system: that is the case Ozimut serves; no federation
  interface is assumed.
- **The desk**: Chrono's « Accueil » on the day (§5).

Duplicates: one entry per `person` and event (`_lib/booking.js personOf`: the licence, else the folded name and the club key).

### The list of entrants is public

`GET /api/entries/<event>/public`: names, clubs, classes, start times of `entered` entries — no licence, card, year of birth,
amount or payment state. Visitors read it with the guest pass (`_middleware.js` GUEST).

### Start times

`entry_forms.starts.mode`: `none`, `booking` (the runners choose a slot on the grid — the booking's settings: circuits by
course, first, last, step, the club gap, max per account, blocked slots; enforced in SQL as `api/booking` did), `draw` (Chrono's
`draw.js` run in the organisers' browser on the entries shaped as Chrono's state; the result posted as starts), `deposit` (a
start-list file read as `orgstarts.js` does, rows matched to entries by `person`). Publication: `_lib/booking.js publish`'s way
(an organiser's deposit of kind « startlist » made from the entries, then a `prov` run), at the closing and on demand. The
alerts « Mes horaires » (moved, cancelled, the day before) follow the entries (`users.book_mail`, `book_push`).

## 4. Amounts due and club accounts

### Prices (`entry_forms.prices`, `site/assets/js/entryprice.js`, shared by the browser and the Functions)

```
{ currency: "EUR",
  bands: [{ label, maxAge?, minAge?, licensed?: true|false, amount }],  // cents; first band that fits (age = race year − birth year)
  classes: { <class id>: amount },                                    // a class's own price overrides the bands
  rent: 0, late: 0,                                                   // a rented card; an entry after `closes` until `late_until`
  options: [{ id, label, amount }],
  family_cap: 0,                                                      // one payer's entries for the event never above it (0: none)
  own_free: false }                                                   // the organising club's members enter free
```
`priceOf(rules, runner, ctx) → { cents, parts: [[label, cents]…] }`; `capFamily(rules, entries)` spreads the cap. The price is
fixed on the entry (`price`, `price_rule`); a later change of the grid does not alter it.

### Who pays: the club's policy (`org_settings.entry_policy`, `functions/_lib/clubpolicy.js payerFor`)

`mode`: `self` (default: members pay their own entries) · `champ` (the club carries championships: an event whose name says
« Championnat » — national and league) · `all` (carries everything, `except` events) · `case` (carries only the `include`
events, ticked by the treasurer). `recover: true`: what the club carries goes on each member's year-end bill. A club carries
only runners it recognises: France — the licence's club (`clubOf`) is the org; elsewhere — the runner's account is an `ok`
member. `payerFor` → `{ payer: "club", org }` or `{ payer: "runner" }`. The runner chooses nothing; the form says « pris en
charge par votre club » or the amount.

### References and states

One reference per payer and event (`entry_refs`, « OZ-XXXX », 4 characters of `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, unique):
payer `u<user id>` (the account that entered, a parent for their children) or `o<org id>` (a club). `pay_state`: due, paid,
waived; `paid_how`: transfer, cash, cheque, card, club, other. Marked by the event's team or the organising org's treasurer:
one by one, by reference, in bulk, at the desk (§5), or from **the bank's statement file read in the browser**
(`site/assets/js/bankstatement.js`: CSV with French, English or German headings, OFX, CAMT.053 — a line carrying a reference
matched, one without proposed by amount and name; only the matched lines are sent). The runner sees the amount, the
organising club's holder and IBAN (from its settings; shown to those who owe it), the reference, and « ou sur place » when the
form allows it. No QR code (France's banking apps do not read it). Reminders in the club's name (mail and push) at the
treasurer's request.

### Club accounts (`functions/api/accounts/[[path]].js`, « Mon club › Comptes »)

- **As organiser**: per visiting club whose policy carries its runners: their entries, the total, the reference `o<org>`, the
  transfer expected, paid or not — a statement page (print / PDF in the browser).
- **As the runners' club**: what it owes each organiser (entries `payer_org` = it), and the **ledger per member**: what it
  carried (entries), what the member paid back (`club_ledger` repaid), bills sent; the **year-end bill** (« relevé de fin
  d'année ») per member and season (the calendar year, orienteering's season: owner, 2026-11-23) — PDF made in the browser (pdf-lib, vendored), e-mailed in the club's name, its reference
  `OZ-<club>-<member>` — and each member's balance under « Mon club ». CSV journal by event and by member.
- **Netting** (owner, 2026-11-22): each club ticks the clubs it accepts netting with (`org_netting`); when both have accepted
  each other, both see what each owes the other for the season and the net, with « solder » (each marks its side paid once
  the one transfer of the net is made). Information only; nothing is held or moved by Ozimut.

## 5. Chrono's welcome desk

The event's Chrono log (`chrono/e<event id>/` in R2, `functions/api/chrono/[[path]].js`) receives the entries from a
**server station** `ozimut` (its sequence `entry_forms.chrono_n`): `put` operations on `runners` with id = `entries.chrono_id`
(« oz<entry id> »), fields `{ family, given, club, cls, card, lic, birth, sex, rent, fee, paid, start, oz: <entry id>,
payClub?: <club name> }` — `fee` the price in the event's currency units, `paid` true when nothing is to be collected at the
desk (paid, waived, or carried by a club); classes and clubs put when missing (matched by name to those Chrono already has).
As built (2026-11-23, `functions/_lib/entrychrono.js` `link`, `toChrono`, `fromChrono`; the R2 log code in
`functions/_lib/chronolog.js`): `paid` is 1 (as Chrono's own desk writes it); `cat` is sent too; a pending entry is not written;
a cancelled entry becomes `status: "dns"` (Chrono's reading of IOF « Cancelled »: its reads stay), a deleted one is removed;
only the fields that changed are written, and a desk value the entries cannot hold is never overwritten; the read-back cursor
lives in R2 `chrono/e<id>/oz.json` (`chrono_seen` a copy); the desk's « paid » sets `paid_how` "cash". The log is written only
once it exists, or after « Envoyer les inscriptions à Chrono » (`POST /api/entries/<event>/chrono`). Written after each change of
entries, and read back: the operations of the other stations since
`chrono_seen` on runners with `oz` (paid, card, rent, class, dns) update the entries; a runner added at the desk becomes an
entry (origin desk). `/api/chrono/<event>` also opens to the event's team (`isMember` / `canManage`), not only
administrators. Nothing changes in Chronoz unless a field must be shown at the desk; such a change is made in its own
repository first, then copied by `tools/chrono_sync.mjs`.

## 6. Pages, texts, files

| Piece | Files |
|---|---|
| Clubs | `functions/_lib/orgs.js`, `functions/api/orgs/[[path]].js`, `site/assets/js/pages/monclub.js` (#/monclub, route `myClub`, outside the modules as Réglages), i18n area `club` |
| Maps | `functions/api/orgmaps/[[path]].js`, `site/assets/js/pages/clubmaps.js` (the tab « Cartes » of Mon club), i18n area `orgmaps` |
| Entries | `functions/_lib/entries.js`, `functions/api/entries/[[path]].js`, `site/assets/js/entryprice.js`, `pages/entriesorg.js` (the Orga tab), `pages/entry.js` (#/inscription, #/mes-inscriptions; Arena), i18n area `entries` |
| Accounts | `functions/_lib/clubpolicy.js`, `functions/api/accounts/[[path]].js`, `site/assets/js/bankstatement.js`, `pages/clubaccounts.js` (the tab « Comptes » of Mon club, and the treasurer's marks in the Orga tab), i18n area `accounts` |
| Chrono | `functions/_lib/entries.js toChrono / fromChrono`, `functions/api/chrono/[[path]].js` |

Every text in the four languages (fr, en, de, es) in the area's catalogues; `node tools/i18n_check.mjs --strict` passes. The
privacy page says what is kept (roles visible to the club's members; entries, their public list, amounts and payment marks; the
ledger; deletion: an account's entries to come are cancelled, its past entries keep the name for the organisers' records).
Account deletion (`api/account/delete.js`): org rows go (CASCADE); a last manager must name another first (409 `last_manager`).
