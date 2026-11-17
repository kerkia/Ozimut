# Chrono and MeOS — the format facts relied on

`chrono/io/meosxml.js`, `mop.js` and `sirap.js` read and write MeOS's files and protocols. MeOS is under the Affero GPL: its
source was read **only for names, units and numbers**; no code, comment or structure of it is in Chrono. Nothing here was
tried against a running MeOS (see the end). Marks: **[S]** read in MeOS's source, **[D]** documented or built the same way
by a third party, **[I]** inferred.

Sources (`M/` = `https://raw.githubusercontent.com/melinsoftware/meos/master/code/`; tags `v3.8.1306`, `v3.9.1437`,
`v4.0.1530`, `v5.0.1807` of https://github.com/melinsoftware/meos read the same way):
`M/oEvent.cpp`, `M/oRunner.cpp`, `M/oRunner.h`, `M/oCard.cpp`, `M/oPunch.cpp`, `M/oPunch.h`, `M/oControl.cpp`,
`M/oControl.h`, `M/oCourse.cpp`, `M/oClass.cpp`, `M/oClub.cpp`, `M/oTeam.cpp`, `M/oFreePunch.cpp`, `M/oDataContainer.cpp`,
`M/xmlparser.cpp`, `M/meos_util.cpp`, `M/timeconstants.hpp`, `M/meosversion.cpp`, `M/infoserver.cpp`, `M/onlineresults.cpp`,
`M/SportIdent.cpp`, `M/SportIdent.h`, `M/TabSI.cpp`; WiRoc
https://raw.githubusercontent.com/henla464/WiRoc-Python-2/master/utils/utils.py (and `datamodel/datamodel.py`); YAROC
https://raw.githubusercontent.com/sokolpezinok/yaroc/master/python/yaroc/clients/sirap.py; this project's
`live/src/mop.js`.

## The event file (`.meosxml`)

| Fact | Mark | Source |
|---|---|---|
| Root `<meosdata version="5.0">`; the version is MeOS's major version; a file of a newer version only asks for a confirmation; no conversion by version | S | oEvent.cpp, meosversion.cpp |
| Children in order: `Name`, `Date` (YYYY-MM-DD), `ZeroTime`, `NameId`, `Annotation`, `Id`, `Updated`, `oData`, `ControlList`, `CourseList`, `ClassList`, `ClubList`, `RunnerList`, `TeamList`, `PunchList`, `CardList`, `Lists`, `Maps`, `Images`, `Machines`; all optional on reading (`NameId` absent: from the file's name) | S | oEvent.cpp |
| Rows need `Id` > 0; a control, course or class of an Id seen before is skipped; a runner without a valid Id is dropped, its card kept without owner | S | oEvent.cpp |
| Declaration `encoding="UTF-8"` (or ISO-8859-1), no BOM written, a BOM skipped on reading; booleans `true` / `false` | S | xmlparser.cpp |
| `oData`: one child element per field, named as the field, its value as text; unknown ones ignored, missing ones default | S | oDataContainer.cpp |
| **Times**: all relative to `ZeroTime`; `ZeroTime` itself is seconds after midnight | S | oEvent.cpp, oRunner.cpp |
| Up to 3.8: plain integers of seconds (written and read as integers) | S | v3.8.1306 oRunner.cpp |
| From 3.9: the program counts in tenths (`timeConstSecond` 10) and writes seconds — whole seconds bare, else `seconds.tenth` (`3600.5`, `-2.5`); a build counting hundredths writes two digits | S | xmlparser.cpp, timeconstants.hpp (v3.9, v4.0, master) |
| So the file never holds bare tenths: the two forms are told apart by the decimal point, not by the version | S | the two rows above |
| A bare `-1` is « no time »; minus one second is written `-1.0`; empty text reads 0; `HH:MM:SS` is **not** read in a file | S | xmlparser.cpp, meos_util.cpp |
| A start or a finish ≤ 0 is « none » | S | oRunner.cpp |
| MeOS takes an hour's margin between its zero time and the first start | D | Swedish federation's MeOS instruction (nya.orientering.se, « instruktion för MeOS på enkel tävling ») |
| `Control`: `Id`, `Updated`, `Name`, `Numbers` (codes joined by `;`, read split on `; ,` or space, each 1…1023, 32 at most; none valid: the Id), legacy `Number`, `Status`, `oData` (`TimeAdjust`, `MinTime`, `Rogaining` points, `Radio` 1 radio / 2 not, `Unit`, `xpos`…) | S | oControl.cpp, oEvent.cpp |
| Control status: 0 OK, 1 bad, 2 multiple, 4 start, 5 finish, 6 rogaining, 7 no timing, 8 optional, 9 bad no timing, 10 rogaining required, 11 check | S | oControl.h |
| `Course`: `Id`, `Updated`, `Name`, `Length`, `Controls` (control **Ids**, each followed by `;`), `Start`, `Finish`, `Legs`, `oData` (`Climb`, `NumberMaps`, `StartName`, `RPointLimit`, `RTimeLimit`, `RReduction`, `RReductionMethod`, `FirstAsStart`, `LastAsFinish`, `CControl`, `Shorten`) | S | oCourse.cpp, oEvent.cpp |
| `Length` and `Climb` are metres; `RTimeLimit` is a score course's time limit | I | — |
| `Class`: `Id`, `Updated`, `Name`, `Course` (a course Id), `MultiCourse` (legs split by `;`, course Ids by spaces, `@` empty), `LegMethod`, `oData` (`FirstStart`, `StartInterval`, `SortIndex`, `ClassFee`, `HasPool`, `NoTiming`, `LowAge`, `HighAge`, `Sex`…) | S | oClass.cpp, oEvent.cpp |
| One leg of several courses + `HasPool` 1 = a course pool, MeOS finding each runner's course | I | — |
| `Club`: `Id`, `Updated`, `Name`, `AltName`*, `oData` (`ShortName`, `Nationality`, `ExtId`, `District`…) | S | oClub.cpp, oEvent.cpp |
| `Runner`: `Id`, `Updated`, `Name`, `Start`, `Finish`, `Status`, `CardNo`, `StartNo`, `InputPoint`, `InputStatus`, `InputTime`, `InputPlace`, `Club`, `Class`, `Course` (Ids), `MultiR`, `Card` (nested), `oData`, nested `Runner`s (a runner's further races) | S | oRunner.cpp |
| Runner `oData`: `Fee`, `CardFee`, `Paid`, `BirthYear` (a year, or YYYY-MM-DD), `Bib` (text), `Sex`, `Nationality`, `ExtId` (64-bit integer), `TimeAdjust`, `PointAdjust`, `Rank`, `Phone`… | S | oEvent.cpp, oDataContainer.cpp |
| `Sex` written `F`, `M`, `B` or empty; read by first letter: F K W female, M H male | S | meos_util.cpp |
| Name stored « Family, Given »; without a comma the first word is the given name (more of them when in MeOS's list of given names), the rest the family name | S | meos_util.cpp, oRunner.cpp |
| A name of one word is taken here as the family name (MeOS: the given name) | I | — |
| Status: 0 unknown, 1 OK, 2 no timing, 3 MP, 4 DNF, 5 DQ, 6 over max time, 15 out of competition, 20 DNS, 21 cancelled, 99 not competing | S | oRunner.h |
| The `Status` written is the stored one (not the one re-evaluated in memory) | S | oRunner.cpp |
| Running time = finish − start + `TimeAdjust`, never below 0 | S | oRunner.cpp |
| A card's start punch becomes the start when the runner has none (or the class takes start punches) | S | oRunner.cpp |
| Mapping to Chrono: 2, 15, 99 → `nc` (as live/src/mop.js); 21 → `dns`; written back, `nc` is 15 with a finish, 99 without | I | — |
| A cards' fee ≠ 0 means a rented card | I | — |
| A vacant place: a runner named Vakant / Vacant… without a card (left out of the set) | I | — |
| `Card`: `CardNo`, `Punches`, `ReadId`, `Voltage` (mV), `BatteryDate`, `Id`, `Updated`; a card with an owner is nested in its `Runner`, `CardList` holds only the others | S | oCard.cpp, oEvent.cpp |
| Punch string: `type-time[@unit][#origin];` each — `31-3605;`, `31-3605.7@31#17;`, negative `31--12.5;`, no time `31--1;`; without `-` the time is 0 | S | oPunch.cpp (v3.9: no `#origin`) |
| Punch types: 1 start, 2 finish, 3 check, 11111 rented card; 30 and above a control's code | S | oPunch.h |
| `PunchList` / `Punch`: `CardNo`, `Time`, `Type`, `Unit`, `Origin`, `Id`, `Updated` (child elements) | S | oFreePunch.cpp |
| `Team`: `Id`, `StartNo`, `Updated`, `Name`, `Start`, `Finish`, `Status`, `Runners` (runner Ids each followed by `;`, 0 an empty leg), `Club`, `Class`, `Input…`, `oData` | S | oTeam.cpp |
| Money fields are bare integers, divided here by the event's `CurrencyFactor` | S / I | oDataContainer.cpp / — |

## MOP (MeOS Online Protocol 2.0)

| Fact | Mark | Source |
|---|---|---|
| Root `MOPComplete` or `MOPDiff`, `xmlns="http://www.melin.nu/mop"`; order competition, ctrl, cls, org, tm, cmp; in a diff the deletions first | S | infoserver.cpp |
| `competition` `date`, `organizer`, `homepage`, `zerotime`, text = name | S | infoserver.cpp |
| `date` is YYYY-MM-DD, `zerotime` HH:MM:SS | I | (live/src/mop.js wants that date) |
| `ctrl id` (+ `offline="true"`), text = name, « 31-2 » for a control's further visits | S | infoserver.cpp |
| `cls id ord radio` (+ `crs`, `maps`, `len`, `climb`): radio control ids joined by `,`, legs by `;` | S | infoserver.cpp |
| `org id` (+ `nat`); `tm id` with `base` and `r` (runner ids, `;` between legs, `,` within one, 0 none) | S | infoserver.cpp |
| `cmp id card competing="true"` with `base org cls stat st rt` (+ `prel="true"`, `crs`, `bib`, `nat`), `radio` (`id,time;id,time`, times > 0 only), `input it tstat` | S | infoserver.cpp |
| `st`, `rt`, radio times in tenths of a second; `st` = zero time + start, so after midnight, `-1` none; `stat` = the runner status number | S | infoserver.cpp, timeconstants.hpp |
| Only `org`, `tm`, `cmp` carry `delete="true"`; a class or control gone makes MeOS send the whole race | S | infoserver.cpp |
| Radio control ids are MeOS's own course-control numbers; Chrono's are the code, + 100000 for each further visit | I | — |
| Sent by HTTP POST with `competition` and `pwd`, zipped past 1 KB if asked; the answer `<MOPStatus status="OK|BADCMP|BADPWD|NOZIP|ERROR">` | S | onlineresults.cpp |

docs.oresults.eu's MOP page refused automated access (403) and was not read.

## SIRAP (MeOS's « TCP » punch input)

| Fact | Mark | Source |
|---|---|---|
| MeOS listens on a TCP port, 10000 by default; the name SIRAP is the senders', not in MeOS's source | S | TabSI.cpp, SportIdent.cpp |
| 15 bytes read at fixed offsets: 0 type, 1-2 code, 3-6 card, 7-10 « code day » (obsolete, unused), 11-14 time; little-endian | S + D | SportIdent.cpp; WiRoc and YAROC build the same |
| Time: tenths of a second after midnight | D (+ S: passed on untouched as MeOS's tenths) | YAROC, WiRoc; SportIdent.cpp |
| Type 0 a punch; type 64 with 2…192 in the code field and time 0 is a card: that many 8-byte records follow (code 4 bytes, time 4 bytes) | S + D | SportIdent.cpp, SportIdent.h; YAROC |
| Record codes 1, 2, 3 are start, finish, check | S + D | SportIdent.cpp, oPunch.h; YAROC (1, 2) |
| No answer, no framing; a short read ends the connection; a card whose records do not come whole is dropped | S | SportIdent.cpp |
| A single punch of a code MeOS maps to a start/finish/check unit, or below 31, is taken as that unit's (else a finish) | S | SportIdent.cpp |

ROC's and jSh.radio's own descriptions were not found online.

## Not checked against a real MeOS

No published sample `.meosxml` was found, and no file written here was opened in MeOS. Unknown: whether MeOS accepts the
reduced files (no `Updated`, no event `oData`), what it shows for version « 3.8 » / « 3.9 », how it re-evaluates the
statuses written when it opens the file (a runner with a card is judged again from the card), `HasPool`, a score course's
`RTimeLimit`, the `nc` mapping (15 / 99); MOP as taken by servers other than this project's reader; SIRAP against MeOS's
listener or a real ROC / WiRoc.
