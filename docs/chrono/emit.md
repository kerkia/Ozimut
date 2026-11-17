# Ozimut Chrono — Emit (EPT e-cards, the « 250 » reader, the MTR4)

Written without any Emit hardware (2026-11-17). Everything below comes from published documents and from the few real
frames found described online; `tools/chrono/t_emit.mjs` checks the code against them. Code: `site/assets/js/chrono/emit/`
(`protocol.js` codec and stream decoder, `reader.js`, `sim.js`).

Confidence marks: **A** confirmed by two independent sources or by a real frame, **B** one source, **C** inferred.

## Sources

| Key | What | Where |
|---|---|---|
| M4 | Emit, MTR4 user manual, rev 3 (2004) | https://emit.no/wp-content/uploads/2022/06/MTR4MANUAL-ENG.pdf |
| ES | Emit, eScan2 user manual (2021) | https://emit.no/wp-content/uploads/2021/07/eScan2-eng.pdf |
| L250 | Notes on the 250's frame (a transcription of Emit's sheet « Regnly EPT system », 11.2.94), in an open TypeScript library — **GPL-3: read for facts only** | https://github.com/mikaello/emit-punch-cards-communication/blob/master/documentation/250-protocol-description.md |
| LMTR | The same library's notes on the MTR protocol (Emit's MTR sheet) | …/documentation/mtr-protocol-description.md |
| LPR | Its pull request 461: which bytes the card's head check covers, counted on its saved MTR4 captures | https://github.com/mikaello/emit-punch-cards-communication/pull/461 |
| LCAP | Its test captures of real units (`src/mockdata/`: a 250 frame, an MTR4 card message, an MTR4 status, a « history » message) and the `/SC` bytes its tests expect | https://github.com/mikaello/emit-punch-cards-communication/tree/main/src/mockdata |
| LUSB | Its author's USB descriptors of a 250, an MTR4, an eScan | https://gist.github.com/mikaello/791af810d94a0457b9099037d0a1934e |
| PK | A small Node reader of the 250 (no licence stated): the offsets it reads, and one real card decoded (`sampleOutput.json`) | https://github.com/peksi/mtr-reader |
| HS | A Java reader of the 250 (no licence stated): `Read250.java`, `Frame.java` | https://github.com/hennings/Emit-Serial-250-Skolesprinten |
| MP | A Scala reader of the 250 (no licence stated): `Flow.scala`, `SerialPort.scala` | https://github.com/mpeltonen/emit-reader |

From the GPL-3 library came: the two protocol notes (L250, LMTR), the head-check fact (LPR), the real frames used as test
vectors (LCAP: device output, reproduced as bytes) and the USB ids. None of its code or structure was copied; the other
three readers were read the same way, for facts. Not reachable: Emit's original MTR sheet (`ttime.no/rs232.pdf`, cited by
PK: the host is gone, and web.archive.org refuses this tool); emit.no has no support index at the address the library cites.

## The e-card

| Fact | Mark | Source |
|---|---|---|
| 50 places, each a control code (1 byte) and a time in seconds (2 bytes, LSB first, 0-65534) | A | L250, PK, HS, MP, LCAP |
| Code 0 is the start unit; the times count from the moment the card **left** it | A | M4, ES (printout « 0 … Start »), LCAP |
| A reading unit registers on the card as a control: 250 for an MTR or a 250 reader; an eScan2 is set to A-D = 250-253 | A | M4 (« Start(0) and MTR(250) »), ES |
| The race, by Emit: from the **last** start (0) to the last control before the **first** MTR / 250 after it; 48 controls at most between them | B | M4 |
| A control with a low battery adds a place with code 99 next to its own (before it by one sentence of M4, after it by the next and by MP) | B | M4, MP |
| Card number: 3 bytes; production week and year (two digits) follow it | A | L250, PK, HS, LCAP |
| 56 bytes of text: a name (32: « EMIT EPT SYS VER 2 », « Emit EPT V4.20 »; old yellow cards « REGNLY TRACK RECORDING SYSTEM »), a display field (8), then `S0000P0000L0000 ` — S disturbances that woke the card, P tests (put to sleep by a reader within ~4 min), L times awake longer (its races) | A | L250, LMTR, PK, M4 (« L0027 … 27 races ») |
| On one real V4.20 card the text ends after the name with `FF 00 FF 00 …`, no counters; the 250 and the MTR4 did not give the same bytes after the name (`20 20 20 3A` / `26`) | A (seen) | LCAP |
| A reading adds a place for the reading unit; a card read again later gets further 250 places whose times do **not** follow on (3953, 7796, 6961, 9901, 17532, 1, 21255, 10, 0 on one card; 2241 then 288 on another) | A (seen) | LCAP, PK |
| Reading: the place's time keeps moving while the card lies on the unit (250 at 0 s in one capture, 10 s in the next one of the same card), and a card woken by a reader counts from that moment | C | LCAP |
| A card can start with a place that is not the start unit (250 at 0, then a control) | A (seen) | LCAP (history capture) |

What the code does with it: nothing. `punches` are the places in use, in order, raw (all up to the last that is not
code 0 / time 0). `protocol.raceSpan` gives Emit's rule as indexes (`zero`, `finish`, `reader`) and `live`: the first reading
after the race is the card's last place, so the moment of this read is that place's time — the one case where
`readAt` (MTR4) or `at` (250) turns the card's seconds into times of day: `readAt − (t[reader] − t)`.

## The 250 reader

| Fact | Mark | Source |
|---|---|---|
| 9600 baud, 8 bits, no parity, **2 stop bits** (listening with 1 works: MP does) | A | L250, HS, PK |
| USB version: an FTDI chip, 0403:6001, a serial port to the system | B | LUSB |
| Sends only; a frame when a card is put on it, repeated while it lies there | B | L250 |
| 217 bytes, each XOR-ed with 0xDF (the sheet prints « OD »; 255 − 32) | A | L250, PK, HS, MP, LCAP |
| 1-2 `FF FF` · 3-5 card number, LSB first · 6 `00` · 7 week · 8 year · 9 `00` · 10 head check · 11-160 the 50 places · 161-216 text · 217 check | A | L250, PK, HS, LCAP |
| Head check: bytes 3-10 sum to 0 mod 256. Check: bytes 1-217 sum to 0 mod 256 | A | L250, PK, MP, LCAP |
| A 10-byte form (the head alone) | B, not written | MP |

Real frame: card 208560, week 27 of 2014, 26 places — decoded and encoded back to the same bytes in the test.

## The MTR4

| Fact | Mark | Source |
|---|---|---|
| 9600 baud, 8 bits, no parity, **1 stop bit**; not XOR-ed; FTDI 0403:6001 | B (speed also M4, for its printer port) | LMTR, LUSB |
| Keeps 2 040 cards; a card is read once (« reread » until another is read) | B | M4 |
| Every message: `FF FF FF FF` · size (bytes after the preamble) · type · … · check (sum mod 256 of all before it, preamble included) · `00` | A | LMTR, LCAP |
| « M », 234 bytes (size 230): 7-8 unit number · 9-14 year (two digits), month, day, hour, minute, second of the read · 15-16 ms (0) · 17-20 package number · 21-23 card · 24 week · 25 year · 26 head check · 27-176 the 50 places · 177-232 text · 233 check · 234 `00`; numbers LSB first | A | LMTR, LCAP |
| Head check: bytes 21-26 sum to 0 mod 256 (not the unit's bytes) | A | LPR, LCAP |
| « S », 59 bytes (size 55): 7-8 number · 9-14 clock · 15-16 ms · 17 battery (1 = low) · 18-21 last package · 22-25 oldest package · 26-57 the start of the current session and of the 7 before · 58 check · 59 `00` | A | LMTR, LCAP |
| On the one real status, last package 4 158 629 825 and « oldest » 67: the count LMTR derives (last − oldest + 1) does not hold there; the code gives both raw | A (seen) | LCAP |
| A message spooled from memory keeps the card's week and year and the time of the read (LMTR says they are zeroed and the text blanked) | A (seen) | LCAP, LPR |
| Commands, ASCII, no terminator: `/ST` status · `/SA` spool all · `/SBxxxx` spool from package x (LSB first) · `/GBxxxx` one message · `/NS` new session · `/SCymdhms` set the clock (six bytes; year 90-99, 0-53) · `/CL` clear the memory | B (`/SC` and `/ST` A) | LMTR, LCAP |
| The brief's « /GA »: no source; the notes say `/GB` | — | LMTR |

Real frames: the status of unit 14209 (2019-12-08 19:51:53) and its card message for card 208560 (package = the status's
last + 1) — decoded and encoded back to the same bytes in the test.

## What the reader gives

See the head of `reader.js`: the read of design.md plus `src`, `week`, `year`, `text`, `counters`, and for an MTR4 `readAt`,
`readDate`, `mtr { id, pack }`. A 250's repeats of a card are one read (same number, frames less than 2 s apart, whatever
their content); an MTR message is given once (package, card, day and time). A message whose transfer check fails is never
given; an MTR message whose card head check fails is an error, not a read. « auto » opens with 1 stop bit, sends `/ST`
once, and settles on the first good frame.

**For the engine**: by Emit's rule the finish is the last control before the first reading unit's code after the last
start, not the reading unit's own punch and not a later one.

## Not known, not written

- **ECU1, ECB1, ETS1/ETS2 (emiTag time stations)**: 115 200 bit/s, « Normal », « Short » (34 bytes) and « Ext dump »
  protocols (their manuals on emit.no); no field description found.
- **eScan2**: USB serial 115 200 8N1, ASCII frames and `/` commands. Emit's « eScan2 protocol specification V1.0 » is on
  emit.no (https://emit.no/wp-content/uploads/2021/03/ESCAN2-protocol-specification-V1.0.pdf) but every page is marked
  confidential: read, not reproduced, nothing written from it — to be asked of Emit. **eScan** (the first): USB 2047:0300,
  not a serial port (LUSB); no description.
- **ePost, emiTag**: radio; nothing published.
- MTR2/MTR3, the MTR's printer port, MTR5.

## A first test on hardware should check

1. 250: frames arrive with 2 stop bits asked and with 1; whether it really repeats, how often, and whether the repeats
   differ (the last place's time); that one placing gives one read and a second placing after 2 s a second one.
2. That writing `/ST` to a 250 (« auto ») does no harm.
3. MTR4: `/ST` answered at once; a card arrives by itself as « M »; `/SB` and `/SA` re-send; `/SC` sets the clock; what
   « oldest » really is; whether a spool pauses new reads.
4. The card's places against a race on the ground: the start unit's 0, the reader's 250 as last place, the 99 mark's
   side, what a second start or a second reading leaves, the time past 65 534 s.
5. The text of old and new cards (counters or the FF 00 pattern).
