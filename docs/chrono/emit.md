# Ozimut Chrono — Emit (EPT e-cards, the « 250 » reader, the MTR4, the eScan)

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
| ES1 | Emit, eScan user manual (29 June 2016) | https://www.emit.no/wp-content/uploads/2020/06/escan-eng_0.pdf |
| ESP | Emit's support pages of the eScan and the eScan2 (what they say and which files they offer; no file opened but the manuals) | https://emit.no/en/support-base/escan-brikkeleser/ · https://emit.no/en/support-base/escan2/ |
| SHOP | Emit's shop page of the eScan2 (« Product number: 8572 ») | https://emit.no/en/nettbutikk/escan2/ |
| ET1 | Emit, ETS1 user guide, ver. 1.22 (2009) | https://emit.no/wp-content/uploads/2021/03/ETS-ver.1.22_eng.pdf |
| ET2 | Emit, ETS2 user manual, rev. 2.1 (2020) | https://emit.no/wp-content/uploads/2021/03/ETS2-eng.pdf |
| EC | Emit, eClock+ user manual, ver. 1.02 — chapter 11 « Communication »: the line, the commands, the two messages | https://emit.no/wp-content/uploads/2025/12/eClock-ver.-1.02-eng.pdf |

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

## The eScan and the eScan2

Added 2026-11-17, from Emit's public manuals and pages only (ES, ES1, ESP, SHOP, ET1, ET2, EC, LUSB). **Emit's « eScan2
protocol specification V1.0 » (linked from ESP) is marked confidential: it was not opened for this work and nothing here
comes from it.** A search for it brought up a summary of a discussion in the GPL library's tracker (its issue 480) that
repeats some of that specification; none of it is used: the code sends an eScan no command and expects no rhythm, and
the line speed below rests on ET2 and EC.

| Fact | Mark | Source |
|---|---|---|
| eScan (2016, replaced in spring 2021): reads e-cards and emiTags (those up to 10 cm away); data to a PC by its USB cable, to its printer by Bluetooth; a reading code 250-253; clock and code set from a PC with Emit's eUpgrade | A | ES1, ESP |
| eScan on USB: 2047:0300, device class 2 (communications), strings « EMIT AS » / « Emit eScan »; Emit's Windows driver file is « msp430_cdc_escan_driver », « usually installed automatically », and eUpgrade reaches the unit through a COM port — a serial port to Windows (seen as a bare USB device on macOS by LUSB's author) | A | LUSB, ESP, ES1 |
| eScan2 (since spring 2021): e-cards, emiTags, barcodes; « the contents of the tags are simultaneously transferred to a PC and to the included wireless printer »; USB through an FTDI virtual COM port (its driver is FTDI's) | A | ES, ESP |
| eScan2: code A-D = 250-253, or another under 250; clock set on its keypad; emiTag « ack » on by default — off, a tag sends each message three times | B | ES |
| eScan2 « Protocol » menu, « for transferring data to PC »: **Normal** (default), **Short** (« sends 34 bytes », for some external devices), **Ext dump** (extended information, to read emiTags) | B | ES |
| The ETS1 and the ETS2 have the same menu in the same words | A | ET1, ET2 |
| The line of that family: ETS2's serial interfaces, USB (FTDI) among them, 115 200 bit/s, 1 stop bit, no parity; eClock+ on USB 115 200 Bd, 8 bits, no parity | A | ET2, EC |
| The eScan2's own line speed: in no public document. 115 200 8N1 is taken from the line above (same FTDI driver, same menu) | C | — |
| Text messages (eClock+ « via USB and RS-485 »): `02` · items separated by tabs · `03 0A 0D`; an item is a letter and its value | B | EC |
| Status: `I` product-hardware-software (« eClock-HW2-SW2-V1.02 ») · `B` = S · `Z` USB or 485 · `W` the unit's time · `M` last message number · `C` code · `Y` serial number · `H` loop status · `A` battery and charging · `R` checksum | B | EC |
| emiTag message: `B` = M · `Z` · `N` the tag's number · `Y` · `M` message number · `C` code · `E` the passage's time (« 12:34:56.987 ») · `T` the tag's internal race time at the passage · `O` retransmissions · `R` checksum; in lap mode `LAPn` name, `LAPp` lap, `LAPs` start, `LAPr` race time, `LAPl` lap time | B | EC |
| A serial number begins with the product's number: eClock+ 1260 (« Y126099999 »), eScan2 8572 (its display's « Sn=857200002 ») | A | EC, ES, SHOP |
| How `R` is computed | not published | — |
| That an eScan or an eScan2 sends those same two messages | C: said nowhere in public | — |
| What an eScan or an eScan2 sends for an **e-card's content** (its places), and the « Short » and « Ext dump » forms | not public | — |
| An eScan sending the 250's or the MTR4's frames (a « compatible » mode) | no source found: ES, ES1, ESP say nothing of it | — |
| eClock+ commands (`/ST`, `/ID`, `/CDnnn`, `/CL`, `/SChh:mm:ss`…) | B, eClock+ only: none is sent to an eScan | EC |

**What the code does** (`kind: "escan"`, `protocol.js` « text messages », `reader.js`, `sim.js`):

- knows the first eScan by its USB ids (`USB_ESCAN`, `unitOfUsb`, `reader.kindOfPort`; `ui/devices.js` asks for "escan" when
  the port chosen has them). An eScan2 has FTDI's vendor id like a 250 or an MTR4 — its product id is not published — and
  cannot be told from them: it must be asked for by name, `connect("emit", "escan")` (no button does it yet);
- opens the line at 115 200 8N1 (`SERIAL_ESCAN`) and **writes nothing** to the unit;
- reads the two published messages wherever they come: the status → the state "status" (`id`, `name`, `version`, `serial`,
  `product` — « eScan2 », « eClock+ » by the serial number —, `code`, `clock`, `skew`) and `info().model` / `info().unit`;
  an emiTag's passing → `onPunch` (`card`, `code`, `t` = `s`, `race`, `unit`, `msg`, `retries`), once for a tag, code and time;
- any other message in that frame — an e-card's content among them — is counted (`info().unread`) and said once per kind
  as the error "unsupported" (`part: "message"`, `b`): **no card read (`onCard`) ever comes from an eScan**;
- `R` is kept as written, never verified: a message is taken when it is whole (02, a capital letter, tabs and printable
  characters, 03, 2 048 bytes at most). A damaged byte that stays printable is not seen;
- « auto » (9 600 bit/s) also knows these messages — enough for the first eScan, whose USB port has no real speed — but
  never changes speed: an eScan2 under « auto » gives "sync" errors. « auto » has by then written its one `/ST` (the
  status request of the MTR4 and, by EC, of the eClock+); "escan" writes nothing;
- the simulator's "escan" sends the status and the emiTag message of EC (`status()`, `tag()`), any items (`text()`), and
  refuses `insert`: no card message is made up.

**So, today**: a competition timed with e-cards cannot be read out with an eScan or an eScan2 in Chrono — use a 250 or an
MTR4. What an eScan gives here is its identity and, if it speaks as the eClock+ does, emiTag passings.

**To finish it, from Emit** (support@emit.no): 1. leave to implement the « eScan2 protocol specification V1.0 » in an
open-source program (or a copy not marked confidential); 2. the same for the first eScan, which has no document at all;
3. in particular: the message carrying an e-card's content under « Normal », the « Short » and « Ext dump » forms, how
`R` is computed, the commands an eScan takes and how they end, the eScan2's line speed and USB product id; 4. whether
either unit can be set to send the 250's or the MTR's frames. Failing that, a capture of a real unit reading a known
card (the device's own output) would settle 3 for the capture's cases only.

## What the reader gives

See the head of `reader.js`: the read of design.md plus `src`, `week`, `year`, `text`, `counters`, and for an MTR4 `readAt`,
`readDate`, `mtr { id, pack }`. A 250's repeats of a card are one read (same number, frames less than 2 s apart, whatever
their content); an MTR message is given once (package, card, day and time). A message whose transfer check fails is never
given; an MTR message whose card head check fails is an error, not a read. « auto » opens with 1 stop bit, sends `/ST`
once, and settles on the first good frame — a 250's, an MTR4's or a text message (above). An eScan gives no read, only
punches (`onPunch`) and its status.

**For the engine**: by Emit's rule the finish is the last control before the first reading unit's code after the last
start, not the reading unit's own punch and not a later one.

## Not known, not written

- **ECU1, ECB1, ETS1/ETS2 (emiTag time stations)**: 115 200 bit/s, « Normal », « Short » (34 bytes) and « Ext dump »
  protocols (their manuals on emit.no); no field description found in them. If they send the eClock+'s two messages, the
  "escan" kind reads those — untried, and nothing in Chrono offers it for them.
- **eScan, eScan2 — an e-card's content, « Short », « Ext dump », commands**: see « The eScan and the eScan2 ». Emit's
  « eScan2 protocol specification V1.0 » (https://emit.no/wp-content/uploads/2021/03/ESCAN2-protocol-specification-V1.0.pdf)
  is marked confidential on every page: nothing is written from it — to be asked of Emit. (This file said before that the
  eScan2 speaks « ASCII frames and `/` commands » at 115 200 8N1 and that the first eScan is « not a serial port »: the
  first was not sourced from a public document and is withdrawn; the second was wrong for Windows, see ESP.)
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
6. eScan / eScan2 (listening only, « Normal » protocol): that the port opens (the first eScan as a serial port in Chrome
   on Windows; the eScan2 at 115 200); whether a status comes by itself and in EC's form; what an emiTag read gives; that
   an e-card read shows « unsupported » — and keep the bytes of that message for Emit's answer.
