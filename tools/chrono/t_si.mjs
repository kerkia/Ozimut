// node tools/chrono/t_si.mjs — SPORTident: the CRC, the frames, the cards, a reader against the simulated station.
//
// The recorded frames and card dumps are GecoSI's (src/test/net/gecosi/SiMessageFixtures.java and its dataframe tests,
// MIT, Copyright (c) 2013 Simon Denier), each checked against its own recorded CRC when it was ported. The repository is
// public: in the blocks that carried a card holder (block 0 of the cards 6, 9, 10 and 11) the name, club, e-mail and
// address were replaced by invented text — those blocks have no `crc` here; every other byte is as recorded.
// The made-up layouts (a card 5, a card 10 and a pCard with 16 punches, two stations' system data) and the CRC, date and
// card-number vectors are sportident.js's test data (MIT, Copyright (c) 2018 Simon Hatt).
import { CMD, LEGACY, ACK, NAK, MODE, SYS, Decoder, crc, encode, cardNumber, cardBytes, timeBytes, parseTime, parseSystem, parseCardEvent, parsePunch, punchBytes } from "../../site/assets/js/chrono/si/protocol.js";
import { cardFamily, blocksOf, decodeCard, encodeCard } from "../../site/assets/js/chrono/si/cards.js";
import { openReader } from "../../site/assets/js/chrono/si/reader.js";
import { simStation } from "../../site/assets/js/chrono/si/sim.js";
import { serialSupported, requestPort, knownPorts, transportOf } from "../../site/assets/js/chrono/si/webserial.js";
import { normaliseRead } from "../../site/assets/js/chrono/times.js";

let fails = 0, n = 0;
const ok = (cond, what) => { n++; console.log(cond ? "ok  " : "FAIL", what); if (!cond) fails++; };
const eq = (a, b, what) => { const x = JSON.stringify(a), y = JSON.stringify(b); ok(x === y, x === y ? what : `${what}: ${x} != ${y}`); };
const hex = (s) => Uint8Array.from(s.trim().split(/\s+/).filter(Boolean).map((x) => parseInt(x, 16)));
const EE = (k) => "EE ".repeat(k);
const H = (h, m = 0, s = 0) => h * 3600 + m * 60 + s;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (cond, ms = 3000) => { for (const t0 = Date.now(); Date.now() - t0 < ms;) { if (cond()) return true; await sleep(5); } return false; };

// ---- recorded frames (GecoSI)
const REC = {
  startup_answer: "02 F0 03 00 01 4D 0D 11 03",
  ok_ext_protocol_answer: "02 83 04 00 01 74 05 B1 64 03",
  no_ext_protocol_answer: "02 83 04 00 01 74 04 31 61 03",
  no_handshake_answer: "02 83 04 00 01 74 03 B1 70 03",
  si6_64_punches_answer: "02 83 04 00 01 33 C1 21 FA 03",
  si6_192_punches_answer: "02 83 04 00 01 33 FF A1 7D 03",
  sicard5_detected: "02 E5 06 00 01 00 03 10 93 B7 37 03",
  sicard5_removed: "02 E7 06 00 01 00 03 10 93 97 3B 03",
  sicard6Star_detected: "02 E6 06 00 01 00 FF 00 00 68 64 03",
  sicard8_detected: "02 E8 06 00 01 02 1E 99 5B FA 04 03",
  sicard10_detected: "02 E8 06 00 01 0F 76 9E 72 0B D2 03",
  sicard11_detected: "02 E8 06 00 01 0F 98 7E 52 C6 45 03",
  sicard5_data: `02 B1 82 00 01
      AA 2E 00 01 10 93 03 00 00 00 00 00 00 00 00 00
      65 10 93 EE EE 01 F8 0B 56 EE EE 28 03 A6 00 07
      00 24 9C 7B 26 9C 8C 22 9C 8D 28 9C 8F 34 9C 9B
      00 36 9C 9F 33 9C A1 35 9C A2 3C 9C A7 3B 9C A8
      00 00 EE EE 00 EE EE 00 EE EE 00 EE EE 00 EE EE
      00 00 EE EE 00 EE EE 00 EE EE 00 EE EE 00 EE EE
      00 00 EE EE 00 EE EE 00 EE EE 00 EE EE 00 EE EE
      00 00 EE EE 00 EE EE 00 EE EE 00 EE EE 00 EE EE
      86 C8 03`,
};
// ---- recorded cards (GecoSI), block by block; `crc`: the CRC of the recorded frame that carried the block
const DUMP = {
  si6: {
    0: { hex: `
      01 01 01 01 ED ED ED ED 55 AA 00 0C 87 0B BA A3
      00 23 05 06 06 0A 8B 44 06 07 8A ED 06 04 8A EB
      06 06 8A D9 EE EE EE EE 00 00 00 00 20 20 20 20
      44 75 72 61 6E 64 20 20 20 20 20 20 20 20 20 20
      20 20 20 20 53 61 63 68 61 20 20 20 20 20 20 20
      20 20 20 20 20 20 20 20 20 20 20 20 4F 4B 20 54
      65 73 74 20 20 20 20 20 20 20 20 20 20 20 20 20
      20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
    ` },
    6: { hex: `
      06 1F 8B 05 06 20 8B 12 06 21 8B 1D 06 22 8B 28
      06 23 8B 33 EE EE EE EE EE EE EE EE EE EE EE EE
    ` + EE(96), crc: 0xBD11 },
    7: { hex: EE(128), crc: 0x86E3 },
  },
  si6x: {
    0: { hex: `
      01 01 01 02 ED ED ED ED 55 AA 00 0C 87 0B BA A3
      80 7A 65 66 0D 0A 15 6C 06 08 8F 90 06 04 8F 8E
      06 07 8F 8B EE EE EE EE 00 00 00 00 20 20 20 20
      44 75 72 61 6E 64 20 20 20 20 20 20 20 20 20 20
      20 20 20 20 53 61 63 68 61 20 20 20 20 20 20 20
      20 20 20 20 20 20 20 20 20 20 20 20 4F 4B 20 54
      65 73 74 20 20 20 20 20 20 20 20 20 20 20 20 20
      20 20 20 20 20 20 20 20 20 20 20 20 20 20 20 20
    ` },
    6: { hex: `
      06 1F 8F 9A 06 20 8F 9C 06 21 8F 9E 06 22 8F A0
      06 23 8F A3 06 1F 8F AB 06 20 8F AD 06 21 8F AF
      06 22 8F B1 06 23 8F B3 06 1F 8F B7 06 20 8F B9
      06 21 8F BB 06 22 8F BE 06 23 8F C1 06 1F 8F C6
      06 20 8F C9 06 21 8F CB 06 22 8F CD 06 23 8F D0
      06 1F 8F D5 06 20 8F D7 06 21 8F D9 06 22 8F DB
      06 23 8F DD 06 1F 8F E2 06 20 8F E4 06 21 8F E6
      06 22 8F E8 06 23 8F EA 06 1F 8F EF 06 20 8F F1
    `, crc: 0xE7F0 },
    7: { hex: `
      06 21 8F F3 06 22 8F F5 06 23 8F F8 06 1F 8F FD
      06 20 8F FF 06 21 90 01 06 22 90 03 06 23 90 06
      06 1F 90 0A 06 20 90 0D 06 21 90 0F 06 22 90 12
      06 23 90 15 06 1F 90 1A 06 20 90 1C 06 21 90 1F
      06 22 90 22 06 23 90 24 06 1F 90 29 06 20 90 2B
      06 21 90 2E 06 22 90 30 06 23 90 33 06 1F 90 37
      06 20 90 3A 06 21 90 3C 06 22 90 3F 06 23 90 41
      06 1F 90 45 06 20 90 47 06 21 90 49 06 22 90 4C
    `, crc: 0x8DC9 },
    2: { hex: `
      06 23 90 4F 06 1F 90 53 06 20 90 55 06 21 90 57
      06 22 90 59 06 23 90 5C 06 1F 90 60 06 20 90 62
      06 21 90 64 06 22 90 66 06 23 90 69 06 1F 90 6E
      06 20 90 72 06 21 90 77 06 22 90 7A 06 23 90 7D
      06 1F 90 82 06 20 90 84 06 21 90 87 06 22 90 89
      06 23 90 8B 06 1F 90 8F 06 20 90 91 06 21 90 93
      06 22 90 96 06 23 90 98 06 1F 90 9C 06 20 90 9D
      06 21 90 9F 06 22 90 A2 06 23 90 A4 06 1F 90 A8
    `, crc: 0xF219 },
    3: { hex: `
      06 20 90 AA 06 21 90 AC 06 22 90 AE 06 23 90 B0
      8D 7A 15 31 EE EE EE EE EE EE EE EE EE EE EE EE
    ` + EE(96), crc: 0xB59B },
    4: { hex: EE(128), crc: 0xBCE3 },
    5: { hex: EE(128), crc: 0xAAE3 },
  },
  si8: {
    0: { hex: `
      DA EE A7 71 EA EA EA EA 35 03 70 4D 35 01 70 4E
      35 02 70 78 00 1F 01 F2 02 1E 99 53 0C FF DD 6F
      32 30 30 35 33 33 31 3B 43 68 72 6F 6E 6F 52 41
      49 44 3B 00 00 00 00 00 00 00 00 00 00 00 00 00
      00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
      00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
      00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
      00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
    `, crc: 0x6790 },
    1: { hex: `
      00 00 00 00 00 00 00 00 35 1F 70 62 EE EE EE EE
    ` + EE(112), crc: 0x6C64 },
  },
  si9: {
    0: { hex: `
      AD C3 AC 72 EA EA EA EA 20 04 9D A7 10 CE 9E 71
      11 C9 03 AF 00 C8 13 83 01 10 32 87 0C FF BE 10
      53 61 63 68 61 3B 44 55 52 41 4E 44 3B 00 00 00
      49 44 3B 00 00 00 00 00 30 86 9E E7 30 8D 9F 3F
      30 8F 9F 8C 30 90 9F E7 30 95 A0 37 30 97 A0 F7
      30 98 A1 62 30 9C A1 DA 30 9E A6 AB 30 A0 A7 AA
      30 A1 A8 16 31 A4 00 08 31 A5 00 9E 31 A3 01 1F
      11 AB 02 78 11 AD 03 11 11 AF 03 3D 31 A9 03 85
    ` },
    1: { hex: `
      11 C8 03 A3 EE EE EE EE EE EE EE EE EE EE EE EE
    ` + EE(112), crc: 0x23CA },
  },
  si10: {
    0: { hex: `
      89 B9 4E 99 EA EA EA EA EE EE EE EE EE EE EE EE
      EE EE EE EE 02 FE 03 E3 0F 76 9E 72 01 0D B8 14
      53 61 63 68 61 3B 44 55 52 41 4E 44 3B 6D 3B 31
      39 39 30 3B 4F 4B 20 54 65 73 74 3B 3B 3B 3B 3B
      3B 53 57 45 3B EE EE EE EE EE EE EE EE EE EE EE
    ` + EE(48) },
    4: { hex: `
      05 2A 09 CA 05 26 09 D1 29 20 14 4D EE EE EE EE
    ` + EE(112), crc: 0x780A },
    5: { hex: EE(128), crc: 0xFB8D },
    6: { hex: EE(128), crc: 0xC18D },
    7: { hex: EE(124) + "00 C4 00 C4", crc: 0x8EB2 },
  },
  si11: {
    0: { hex: `
      B2 23 E1 98 EA EA EA EA EE EE EE EE EE EE EE EE
      12 01 7F B9 03 E3 04 B0 0F 98 7E 52 01 0D 0A B0
      53 61 63 68 61 3B 44 55 52 41 4E 44 3B 6D 3B 31
      39 39 30 3B 4F 4B 20 54 65 73 74 3B 3B 3B 3B 3B
      3B 53 57 45 3B EE EE EE EE EE EE EE EE EE EE EE
    ` + EE(48) },
    4: { hex: `
      09 26 2D B7 05 2A 0B 7F 05 26 0B 8A 29 20 14 C0
    ` + EE(112), crc: 0xD0ED },
    5: { hex: EE(128), crc: 0xFB8D },
    6: { hex: EE(128), crc: 0xC18D },
    7: { hex: EE(124) + "00 C4 00 C4", crc: 0x8EB2 },
  },
};
const STATION = { si6: [0, 6], si6x: [0, 6] };
const blocksOfDump = (name) => Object.fromEntries(Object.entries(DUMP[name]).map(([k, v]) => [k, hex(v.hex)]));

// ---- the CRC
eq(crc(hex("53 00 05 01 0F B5 00 00 1E 08")), 0x2C12, "CRC: SPORTident's documented example");
for (const [input, want] of [["", 0], ["01", 0x0100], ["12", 0x1200], ["FF", 0xFF00], ["01 02", 0x0102], ["12 34", 0x1234], ["12 34 56", 0xBABB], ["12 32 56", 0xBAAF],
  ["12 34 56 78", 0x1E83], ["12 32 56 78", 0x1EFB]]) eq(crc(input ? hex(input) : []), want, `CRC of [${input}]`);
for (const [name, s] of Object.entries(REC)) {
  const b = hex(s), d = new Decoder(), m = d.push(b);
  ok(m.length === 1 && d.bad === 0 && crc(b.subarray(1, b.length - 3)) === ((b[b.length - 3] << 8) | b[b.length - 2]), `CRC of the recorded frame ${name}`);
}
for (const [name, blocks] of Object.entries(DUMP)) {
  for (const [k, v] of Object.entries(blocks)) {
    if (v.crc == null) continue;
    const f = encode(name.startsWith("si6") ? CMD.GET_SI6 : CMD.GET_SI8, [...(STATION[name] || [0, 1]), Number(k), ...hex(v.hex)]);
    eq((f[f.length - 3] << 8) | f[f.length - 2], v.crc, `CRC of the recorded block ${name} ${k}`);
  }
}

// ---- frames
eq([...encode(0xFF, [0xEE])], [...hex("02 FF 01 EE EC 0A 03")], "encode: sportident.js's vector");
for (const [cmd, data, want] of [[CMD.SET_MS, [0x4D], "02 F0 01 4D 6D 0A 03"], [CMD.GET_SYS_VAL, [0x74, 1], "02 83 02 74 01 04 14 03"], [CMD.GET_SYS_VAL, [0x33, 1], "02 83 02 33 01 16 11 03"],
  [CMD.GET_SI5, [], "02 B1 00 B1 00 03"], [CMD.GET_SI6, [0], "02 E1 01 00 46 0A 03"], [CMD.GET_SI6, [6], "02 E1 01 06 40 0A 03"], [CMD.GET_SI8, [0], "02 EF 01 00 E2 09 03"],
  [CMD.GET_SI8, [4], "02 EF 01 04 E6 09 03"], [CMD.GET_SI8, [7], "02 EF 01 07 E5 09 03"], [CMD.SIGNAL, [2], "02 F9 01 02 14 0A 03"]]) {
  eq([...encode(cmd, data)], [...hex(want)], `encode: GecoSI's command ${want}`);
}
eq([...encode(CMD.SET_MS, [0x4D], { wake: true })], [...hex("FF 02 F0 01 4D 6D 0A 03")], "encode: with the wake-up byte");
eq([...encode(ACK)], [6], "encode: a lone ACK");
eq([...encode(LEGACY.TRANS_REC, [0x00, 0x05, 0x41, 0x10, 0x03])], [...hex("02 53 10 00 10 05 41 10 10 10 03 03")], "encode: a legacy frame, DLE before the bytes under 0x20");
{
  const d = new Decoder(), m = d.push(encode(LEGACY.TRANS_REC, [0x00, 0x05, 0x41, 0x10, 0x03]));
  eq([m.length, m[0].cmd, m[0].legacy, [...m[0].data]], [1, 0x53, true, [0x00, 0x05, 0x41, 0x10, 0x03]], "decode: a legacy frame");
}
{
  const d = new Decoder(), m = d.push(hex(REC.sicard10_detected));
  eq([m[0].cmd, m[0].stationCode, [...m[0].data]], [0xE8, 1, [0, 1, 0x0F, 0x76, 0x9E, 0x72]], "decode: a frame, its station code");
  const h = new Decoder({ from: "host" }), c = h.push(hex("FF 02 02 F0 01 4D 6D 0A 03"));
  eq([c.length, c[0].cmd, [...c[0].data], c[0].stationCode], [1, 0xF0, [0x4D], undefined], "decode: GecoSI's start-up sequence (wake-up, STX twice), from the computer");
}
{
  const stream = [...hex("00 7F FF 41"), ...hex(REC.sicard5_detected), 0x15, ...hex("13 37"), ...hex(REC.sicard5_data), 0x06, 0xFF, ...hex(REC.sicard5_removed)];
  for (const step of [1, 3, 7, 64, 1000]) {
    const d = new Decoder(), got = [];
    for (let i = 0; i < stream.length; i += step) got.push(...d.push(stream.slice(i, i + step)));
    eq(got.map((m) => m.cmd), [0xE5, NAK, 0xB1, ACK, 0xE7], `decode: frames among stray bytes, in pieces of ${step}`);
    ok(got[2].data.length === 130 && d.bad === 0 && d.skipped === 5, `decode: the card's 130 bytes whole, 5 stray bytes skipped (pieces of ${step})`);
  }
  const bad = hex(REC.sicard8_detected); bad[7] ^= 0x01;
  const d = new Decoder(), m = d.push([...bad, ...hex(REC.sicard11_detected)]);
  eq([m.map((x) => x.cmd), d.bad], [[0xE8], 1], "decode: a frame with a wrong CRC is dropped, the next one read");
  ok(parseCardEvent(m[0]).card === 9993810, "decode: the frame after the wrong one is the right one");
  const e = new Decoder(), half = hex(REC.sicard8_detected);
  const m2 = [...e.push([0x02, ...half.subarray(0, 5)]), ...e.push(half.subarray(5))];
  eq(m2.map((x) => x.cmd), [0xE8], "decode: a frame right after a stray STX");
  let clock = 0;
  const s = new Decoder({ now: () => clock, stale: 1000 });
  s.push(hex("02 EF 83 00 01")); clock = 5000;
  eq(s.push(hex(REC.sicard5_removed)).map((x) => x.cmd), [0xE7], "decode: a frame left unfinished is given up when bytes come much later");
}

// ---- card numbers, families
for (const [b, want] of [[[0, 0, 0], 0], [[0, 0x34, 0x12], 0x3412], [[1, 0x8E, 0x01], 36353], [[2, 0x34, 0x12], 0x3412 + 200000], [[3, 0x10, 0x93], 304243], [[4, 0x34, 0x12], 0x3412 + 400000],
  [[5, 0x34, 0x12], 0x053412], [[8, 0x34, 0x12], 0x083412], [[0x56, 0x34, 0x12], 0x563412], [[0xFF, 0, 0], 16711680]]) eq(cardNumber(...b), want, `card number of ${b}`);
ok([1000, 10000, 65535, 200000, 265535, 300000, 365535, 400000, 465535, 500000, 599999, 999999, 1000000, 1999999, 2000000, 2999999, 7000001, 8999999, 16777215]
  .every((x) => cardNumber(...cardBytes(x)) === x), "card numbers there and back");
eq([1, 499999, 500000, 999999, 1000000, 2000000, 2003500, 2999999, 3500000, 4000001, 6000001, 7000001, 8000001, 9000001, 14000001, 16711680, 0].map((x) => cardFamily(x)),
  ["si5", "si5", "si6", "si6", "si9", "si8", "si6", "si8", null, "pcard", "tcard", "si10", "siac", "si11", "fcard", "si6", null], "families by number");
eq([cardFamily(2005331, 2), cardFamily(1061511, 1), cardFamily(7773810, 15), cardFamily(9993810, 15), cardFamily(8001234, 15), cardFamily(4567890, 4), cardFamily(6000001, 6)],
  ["si8", "si9", "si10", "si11", "siac", "pcard", "tcard"], "families by the series a station gives");
eq([blocksOf("si5"), blocksOf("si6"), blocksOf("siac"), blocksOf("tcard"), blocksOf("fcard")], [[0], [0], [0], [], []], "the first block to read; none for a tCard or an fCard");

// ---- a station's answers
{
  const ev = (name) => parseCardEvent(new Decoder().push(hex(REC[name]))[0]);
  eq([ev("sicard5_detected"), ev("sicard5_removed"), ev("sicard6Star_detected"), ev("sicard8_detected"), ev("sicard10_detected"), ev("sicard11_detected")],
    [{ stationCode: 1, card: 304243 }, { stationCode: 1, card: 304243 }, { stationCode: 1, card: 16711680 }, { stationCode: 1, card: 2005339, series: 2 },
      { stationCode: 1, card: 7773810, series: 15 }, { stationCode: 1, card: 9993810, series: 15 }], "cards put in and taken out (recorded)");
  const sysOf = (name) => parseSystem(new Decoder().push(hex(REC[name]))[0].data);
  eq([sysOf("ok_ext_protocol_answer"), sysOf("no_ext_protocol_answer").extended, sysOf("no_handshake_answer").handshake, sysOf("no_handshake_answer").autosend],
    [{ stationCode: 1, protocol: 5, extended: true, autosend: false, handshake: true, autoReadout: false }, false, false, true], "the protocol byte (recorded)");
  eq([sysOf("si6_64_punches_answer").si6x192, sysOf("si6_192_punches_answer").si6x192], [false, true], "the card 6's 192-punch setting (recorded)");
  const bsm8 = parseSystem([0, 31, 0, ...hex(`
      00 02 C1 A1 F7 36 35 37 0E 06 0B 91 98 80 20 C0 4B 08 4E FA 28 0E 06 0B 00 36 EE 80 00 00 18 04
      FF 01 00 00 00 00 00 00 00 00 00 00 4D 70 FF FF FF 00 00 C1 00 00 00 0B 00 00 00 00 FF 00 FB E5
      00 24 FC 18 FF FF 19 99 0A 3D 7F F8 85 0C 05 01 00 00 00 00 FF FF FF FF 00 00 01 0C FF FF FF FF
      30 30 30 35 7D 20 38 00 00 00 00 00 FF FF FF FF 30 05 1F 33 05 13 06 14 01 9E B9 00 0E 12 00 3C`)]);
  eq([bsm8.serial, bsm8.firmware, bsm8.build, bsm8.model, bsm8.modelName, bsm8.memory, bsm8.mode, bsm8.modeName, bsm8.code, bsm8.beeps, bsm8.flashes, bsm8.extended, bsm8.autosend,
    bsm8.handshake, bsm8.si6x192, bsm8.battery.date, bsm8.battery.capacity, bsm8.lastWrite],
  [180641, "657", "2014-06-11", 0x9198, "BSM8", 128, MODE.READOUT, "readout", 31, false, true, true, false, true, false, "2014-06-11", 1000, { date: "2019-06-20", t: H(23, 17, 13) }],
  "system data: sportident.js's BSM8");
  const bsm7 = parseSystem([0, 10, 0, ...hex(`
      00 01 FC 56 F7 36 32 33 09 0C 01 91 97 80 20 DC 4B 08 4E FA 28 10 08 04 00 6D DD 00 00 00 18 04
      00 04 08 00 00 00 00 00 00 00 00 00 4D 70 FF FF 01 0D 90 00 00 0C 17 28 00 00 00 00 00 00 F8 FF
      00 24 02 E0 FF 38 19 99 05 1E 7F F8 85 0C 01 01 85 0C 6B 98 FF FF FF FF FF FF FF FF FF FF FF FF
      30 30 30 35 7D 20 38 00 00 00 00 00 FF FF FF FF 24 05 0A 35 05 09 01 01 00 0C 2B 00 1C 22 00 78`)]);
  eq([bsm7.serial, bsm7.firmware, bsm7.modelName, bsm7.code, bsm7.beeps, bsm7.battery, bsm7.lastWrite],
    [130134, "623", "BSM7", 10, true, { date: "2016-08-04", capacity: 2000, used: 220, ratio: 0.11 }, { date: "2009-01-01", t: H(0, 51, 55) }], "system data: sportident.js's BSM7");
}
for (const [d, want] of [[new Date(2000, 0, 1, 0, 0, 0), "00 01 01 0C 00 00 00"], [new Date(2000, 0, 1, 12, 0, 0), "00 01 01 0D 00 00 00"], [new Date(2000, 0, 5, 12, 0, 0), "00 01 05 07 00 00 00"],
  [new Date(2099, 11, 31, 12, 0, 0, 500), "63 0C 1F 09 00 00 80"], [new Date(2000, 0, 1, 11, 59, 59, 250), "00 01 01 0C A8 BF 40"], [new Date(1999, 11, 31, 23, 59, 59, 750), "63 0C 1F 0B A8 BF C0"]]) {
  eq([...timeBytes(d)], [...hex(want)], `a clock's bytes: ${want}`);
}
{
  const t = parseTime([0, 1, ...hex("14 0C 1F 01 00 00 20")]);
  eq([t.date, t.dow, t.t, t.at.getHours(), t.at.getMilliseconds()], ["2020-12-31", 0, 43200.125, 12, 125], "a clock read");
  const d = new Date(2026, 10, 17, 10, 42, 7, 500), back = parseTime([0, 1, ...timeBytes(d)]);
  eq([back.at.getTime(), back.date, back.dow, back.t], [d.getTime(), "2026-11-17", 2, H(10, 42, 7) + 0.5], "a clock there and back");
  eq(parsePunch(hex("00 2A 00 0F 42 41 07 1C 20 80 00 01 00")), { code: 42, card: 1000001, t: 43200 + 7200 + 0.5, dow: 3, mem: 256 }, "a punch sent by itself");
  eq(parsePunch(punchBytes({ code: 300, card: 8001234, t: H(10, 16, 40) + 0.25, dow: 6 })), { code: 300, card: 8001234, t: H(10, 16, 40) + 0.25, dow: 6, mem: 0 }, "a punch there and back");
  eq(parsePunch(hex("00 2A 00 0F 42 41 07 EE EE 00 00 01 00")), null, "a punch without a time");
}

// ---- recorded cards
const flat = (r) => r.punches.map((p) => [p.code, p.t]);
{
  const b = new Decoder().push(hex(REC.sicard5_data))[0].data.slice(2), r = decodeCard("si5", { 0: b });
  eq([r.sys, r.card, r.family, r.start, r.finish, r.check, r.clear, r.punches.length], ["si", 304243, "si5", null, { t: 504, half: true }, null, null, 10], "card 5 (recorded): number, times");
  eq([r.punches[0], r.punches[9]], [{ code: 36, t: 40059, half: true }, { code: 59, t: 40104, half: true }], "card 5 (recorded): punches");
  const nr = normaliseRead({ ...r, at: 1 }, H(11));
  eq([nr.card, nr.punches[0], nr.finish, nr.half], [304243, [36, 40059], 43704, 1], "card 5 (recorded): through the engine, the finish after noon as GecoSI has it");
  // GecoSI's own variant of that dump: card 36353 (series 1), 36 punches
  const v = Uint8Array.from(b);
  v.set(hex("8E 01 01"), 4); v.set(hex("04 D2 10 E1 25"), 0x13); v.set(hex("11 5C"), 0x19);
  [0x1F, 0x20, 0x21, 0x22, 0x23, 0x24].forEach((code, i) => { v[0x20 + 16 * i] = code; });
  const w = decodeCard("si5", [v]);
  eq([w.card, w.start.t, w.finish.t, w.check.t, w.punches.length, w.punches[0], w.punches[9], w.punches[10], w.punches[30], w.punches[35]],
    [36353, 1234, 4321, 4444, 36, { code: 36, t: 40059, half: true }, { code: 59, t: 40104, half: true }, { code: 0, t: null }, { code: 31, t: null }, { code: 36, t: null }],
    "card 5 (GecoSI's variant): series 1 adds nothing, 36 punches, the last six without a time");
}
{
  const B = blocksOfDump("si6"), r = decodeCard("si6", B);
  eq(blocksOf("si6", B[0]), [6], "card 6 (recorded): 5 punches need block 6 alone");
  eq([r.card, r.family, r.start, r.finish, r.check, r.clear], [821003, "si6", { t: 35565, dow: 3 }, { t: 35652, dow: 3 }, { t: 35563, dow: 3 }, { t: 35545, dow: 3 }], "card 6 (recorded): number, times");
  eq(flat(r), [[31, 35589], [32, 35602], [33, 35613], [34, 35624], [35, 35635]], "card 6 (recorded): punches");
  eq(r.owner, { family: "Durand", given: "Sacha", country: "", club: "OK Test" }, "card 6: the holder (invented)");
}
{
  const B = blocksOfDump("si6x"), r = decodeCard("si6", B);
  eq(blocksOf("si6", B[0]), [6, 7, 2, 3], "card 6, 192 punches (recorded): 101 punches need blocks 6, 7, 2, 3");
  eq([r.card, r.start.t, r.finish.t, r.check.t, r.punches.length], [821003, 36752, 48684, 36750, 101], "card 6, 192 punches (recorded): number, times");
  eq([0, 1, 32, 63, 99, 100].map((i) => flat(r)[i]), [[31, 36762], [32, 36764], [33, 36851], [34, 36940], [35, 37040], [634, 48625]], "card 6, 192 punches (recorded): punches, a code above 255");
  const part = decodeCard("si6", { 0: B[0], 6: B[6], 7: B[7] });
  eq([part.punches.length, part.partial], [64, true], "card 6: a block missing is said");
}
{
  const B = blocksOfDump("si8"), r = decodeCard("si8", B);
  eq(blocksOf("si8", B[0]), [1], "card 8 (recorded): block 1");
  eq([r.card, r.family, r.start, r.finish, r.check, r.clear, flat(r)], [2005331, "si8", { t: 71950, dow: 2 }, { t: 71992, dow: 2 }, { t: 71949, dow: 2 }, null, [[31, 71970]]], "card 8 (recorded)");
  eq(decodeCard(cardFamily(2005331, 2), B).family, "si8", "card 8: by the station's series");
}
{
  const B = blocksOfDump("si9"), r = decodeCard("si9", B);
  eq(blocksOf("si9", B[0]), [1], "card 9 (recorded): 19 punches need block 1");
  eq([r.card, r.family, r.start.t, r.finish.t, r.check.t, r.punches.length], [1061511, "si9", 40561, 44143, 40359, 19], "card 9 (recorded): number, times");
  eq([0, 8, 18].map((i) => flat(r)[i]), [[134, 40679], [158, 42667], [200, 44131]], "card 9 (recorded): punches");
  eq(r.owner, { given: "Sacha", family: "DURAND" }, "card 9: the holder (invented)");
  eq(decodeCard("x", B).family, "si9", "card 9: an unknown family follows the card's own series");
}
{
  const B = blocksOfDump("si10"), r = decodeCard("si10", B);
  eq(blocksOf("si10", B[0]), [4], "card 10 (recorded): 3 punches need block 4");
  eq([r.card, r.family, r.start, r.finish, r.check, flat(r)], [7773810, "si10", null, null, null, [[42, 45706], [38, 45713], [32, 48397]]], "card 10 (recorded)");
  eq(r.owner, { given: "Sacha", family: "DURAND", sex: "m", birth: "1990", club: "OK Test", country: "SWE" }, "card 10: the holder (invented), no e-mail nor address kept");
}
{
  const B = blocksOfDump("si11"), r = decodeCard(cardFamily(9993810, 15), B);
  eq([r.card, r.family, r.start, r.finish, r.check, flat(r)], [9993810, "si11", null, { t: 32697, dow: 1 }, null, [[38, 54903], [42, 46143], [38, 46154], [32, 48512]]], "card 11 (recorded)");
}
// ---- sportident.js's made-up layouts (its decoder ignores the half-day bit: times compared within 12 hours)
{
  const r = decodeCard("si5", [hex(`
      AA 29 00 01 19 02 04 00 00 00 00 00 00 00 00 00 65 19 02 1D DB 1E 2F 11 56 EE EE 28 04 1F 00 07
      00 1F 1F 1F 20 20 20 21 21 21 22 22 22 23 23 23 00 24 24 24 25 25 25 26 26 26 27 27 27 28 28 28
      00 29 29 29 2A 2A 2A 2B 2B 2B 2C 2C 2C 2D 2D 2D 00 2E 2E 2E 00 EE EE 00 EE EE 00 EE EE 00 EE EE
      00 00 EE EE 00 EE EE 00 EE EE 00 EE EE 00 EE EE 00 00 EE EE 00 EE EE 00 EE EE 00 EE EE 00 EE EE`)]);
  eq([r.card, r.start.t, r.finish.t, r.check, flat(r)], [406402, 7643, 7727, null, Array.from({ length: 16 }, (x, i) => [31 + i, 7967 + 257 * i])], "card 5: sportident.js's 16 punches");
  const head = "77 2A 42 99 EA EA EA EA 37 02 22 1F 07 03 22 11 EE EE EE EE 0F 7F 10 09 0F";
  const sixteen = "1F 1F 1F 1F 20 20 20 20 21 21 21 21 22 22 22 22 23 23 23 23 24 24 24 24 25 25 25 25 26 26 26 26 27 27 27 27 28 28 28 28 29 29 29 29 2A 2A 2A 2A 2B 2B 2B 2B 2C 2C 2C 2C 2D 2D 2D 2D 2E 2E 2E 2E ";
  const ten = decodeCard("si10", { 0: hex(`${head} 6B 96 8C 06 0F 61 53 61 3B 62 3B 63 3B 64 3B 65 3B 66 3B 67 3B 68 3B 69 3B 6A 3B 6B 3B ${EE(74)}`), 4: hex(sixteen + EE(64)) });
  eq([ten.card, ten.family, ten.start.t % 43200, ten.finish, ten.check.t % 43200, ten.punches.map((p) => [p.code, p.t % 43200])],
    [7050892, "si10", 8721, null, 8735, Array.from({ length: 16 }, (x, i) => [31 + i, 7967 + 257 * i])], "card 10: sportident.js's 16 punches");
  eq(ten.owner, { given: "a", family: "b", sex: "c", birth: "d", club: "e", country: "k" }, "card 10: sportident.js's holder");
  const p = decodeCard("pcard", { 0: hex(`${head} 45 B3 52 06 0F 61 53 61 3B 62 3B ${EE(92)}`), 1: hex(EE(48) + sixteen + EE(16)) });
  eq([p.card, p.family, p.start.t % 43200, p.check.t % 43200, p.punches.map((q) => [q.code, q.t % 43200]), p.owner],
    [4567890, "pcard", 8721, 8735, Array.from({ length: 16 }, (x, i) => [31 + i, 7967 + 257 * i]), { given: "a", family: "b" }], "pCard: sportident.js's 16 punches");
}
eq([decodeCard("tcard", [new Uint8Array(128)]), decodeCard("fcard", [new Uint8Array(128)]), decodeCard("si9", {})], [null, null, null], "not decoded: a tCard, an fCard, a card without its block 0");

// ---- there and back
const course = (k, from = H(10, 5), step = 97) => Array.from({ length: k }, (x, i) => ({ code: 31 + (i * 7) % 220, t: from + step * i }));
const SPECS = [
  { card: 304243, family: "si5", start: H(10), finish: H(11, 40), check: H(9, 50), punches: course(12) },
  { card: 36353, family: "si5", start: null, finish: H(13, 10), check: H(11, 55), punches: course(36, H(11, 58), 60) },
  { card: 821003, family: "si6", start: H(10), finish: H(13, 2), check: H(9, 50), clear: H(9, 49), punches: course(40), dow: 2 },
  { card: 16711681, family: "si6", start: H(10), finish: H(16), check: H(9, 50), clear: H(9, 49), punches: [...course(190), { code: 634, t: H(15, 59) }, { code: 1023, t: H(15, 59, 30) }], dow: 6 },
  { card: 2005331, family: "si8", start: H(19, 59), finish: H(21, 2), check: H(19, 50), punches: course(30, H(20)), dow: 2 },
  { card: 1061511, family: "si9", start: H(11), finish: H(12, 15), check: H(10, 55), punches: course(50, H(11, 2), 80), dow: 0 },
  { card: 4567890, family: "pcard", start: H(11), finish: H(11, 40), check: H(10, 55), punches: course(20, H(11, 2)), dow: 1 },
  { card: 7773810, family: "si10", start: null, finish: null, check: H(8), punches: course(3), dow: 3 },
  { card: 9993810, family: "si11", start: H(10), finish: H(23, 59, 59), check: H(9, 58), punches: [...course(127), { code: 999, t: H(23, 59) }], dow: 4 },
  { card: 8001234, family: "siac", start: H(0, 0, 1), finish: H(0, 40), check: H(0), punches: course(33, H(0, 2)), dow: 5 },
];
const five = (t) => (t == null ? null : { t: t % 43200, half: true });
const want = (s) => (s.family === "si5"
  ? { sys: "si", card: s.card, family: "si5", start: five(s.start), finish: five(s.finish), check: five(s.check), clear: null,
    punches: s.punches.map((p, i) => (i < 30 ? { code: p.code, ...five(p.t) } : { code: p.code, t: null })) }
  : { sys: "si", card: s.card, family: s.family, start: s.start == null ? null : { t: s.start, dow: s.dow }, finish: s.finish == null ? null : { t: s.finish, dow: s.dow },
    check: { t: s.check, dow: s.dow }, clear: s.clear == null ? null : { t: s.clear, dow: s.dow }, punches: s.punches.map((p) => ({ code: p.code, t: p.t, dow: s.dow })) });
for (const s of SPECS) {
  const B = encodeCard(s), need = [0, ...blocksOf(s.family, B[0])];
  ok(need.every((k) => B[k]?.length === 128), `${s.family} ${s.card}: the blocks to read (${need}) are those written`);
  eq(decodeCard(s.family, Object.fromEntries(need.map((k) => [k, B[k]]))), want(s), `${s.family} ${s.card}: ${s.punches.length} punches there and back`);
}
{
  const B = encodeCard({ card: 2000001, family: "si8", check: H(9), start: H(10), finish: H(11), punches: course(2), owner: { given: "Alix", family: "Test" } });
  eq(decodeCard("si8", B).owner, { given: "Alix", family: "Test" }, "a holder there and back");
  let code = "";
  try { encodeCard({ card: 304243, family: "si5", punches: course(37) }); } catch (e) { code = e.code; }
  eq(code, "punches", "too many punches for a card are refused");
}

// ---- Web Serial under Node: nothing runs, nothing breaks
eq([serialSupported(), await requestPort("si"), await knownPorts(), typeof transportOf({}).open], [false, null, [], "function"], "Web Serial: absent under Node");

// ---- a reader on the simulated station
const FAST = { probe: 120, timeout: 150, tries: 3, nakWait: 10 };
async function session(simOpts, readerOpts = {}) {
  const sim = simStation(simOpts), got = { cards: [], punches: [], errors: [], states: [] };
  const reader = await openReader(sim.transport, { ...FAST, onCard: (r) => got.cards.push(r), onPunch: (p) => got.punches.push(p), onError: (e) => got.errors.push(e),
    onState: (s) => got.states.push(s.state), ...readerOpts });
  return { sim, got, reader };
}
{
  const { sim, got, reader } = await session({ code: 7 });
  const i = reader.info();
  eq([i.serial, i.mode, i.modeName, i.code, i.extended, i.handshake, i.autosend, i.baud, i.firmware, i.modelName, i.battery.capacity, i.battery.used],
    [123456, MODE.READOUT, "readout", 7, true, true, false, 38400, "656", "BSM8", 1000, 100], "session: the station's system data");
  eq([got.states, sim.info.writes], [["opening", "ready"], []], "session: ready, nothing written to a station already set");
  const s = SPECS[0], before = Date.now();
  sim.insert(s);
  ok(await until(() => got.cards.length === 1 && sim.info.acks === 1), "session, card 5: read and acknowledged");
  const { at, ...read } = got.cards[0];
  eq(read, want(s), "session, card 5: the read");
  ok(at >= before && at <= Date.now() && sim.info.reads === 1, "session, card 5: stamped, one request");
  sim.insert(s);
  await sleep(40);
  eq([got.cards.length, sim.info.acks], [1, 2], "session: the same card announced again is acknowledged, not read twice");
  sim.remove();
  ok(await until(() => got.states.at(-1) === "ready" && got.states.includes("removed")), "session: the card taken out, ready again");
  eq(got.states, ["opening", "ready", "card", "reading", "ready", "removed", "ready"], "session: the states in order");
  sim.insert(s);
  ok(await until(() => got.cards.length === 2), "session: the card put in again is read again");
  sim.remove();
  const nr = normaliseRead(got.cards[1], H(10));
  eq([nr.card, nr.start, nr.finish, nr.punches.length, nr.punches[11]], [304243, H(10), H(11, 40), 12, [s.punches[11].code, s.punches[11].t]], "session, card 5: through the engine");
  const t0 = new Date(2026, 10, 17, 10, 0, 0);
  const set = await reader.setTime(t0), now = await reader.getTime();
  ok(Math.abs(set.at - t0) < 1500 && Math.abs(now.at - t0) < 1500 && now.date === "2026-11-17" && Math.abs(sim.info.clock() - t0) < 1500, "session: the clock set and read");
  await reader.close();
  eq([got.states.at(-1), sim.info.open, got.errors], ["closed", false, []], "session: closed, no error");
}
{
  const { sim, got, reader } = await session({ chunk: 5, noise: true });
  const s = SPECS[5];
  sim.insert(s);
  ok(await until(() => got.cards.length === 1 && sim.info.acks === 1), "session, card 9: read through answers in pieces of 5 bytes, with stray bytes");
  const { at, ...read } = got.cards[0];
  eq([read, sim.info.reads], [want(s), 2], "session, card 9: 50 punches, blocks 0 and 1");
  sim.remove(); sim.insert({ ...s, punches: course(10, H(11, 2)) });
  ok(await until(() => got.cards.length === 2), "session, card 9: a second card");
  eq([got.cards[1].punches.length, sim.info.reads], [10, 3], "session, card 9: 10 punches fit in block 0 alone");
  await reader.close();
}
{
  const { sim, got, reader } = await session({ delay: 1 });
  sim.insert(SPECS[8]);
  ok(await until(() => got.cards.length === 1), "session, card 11: read");
  eq([(({ at, ...r }) => r)(got.cards[0]), sim.info.reads], [want(SPECS[8]), 5], "session, card 11: 128 punches, blocks 0, 4, 5, 6, 7");
  sim.remove(); sim.insert(SPECS[9]);
  ok(await until(() => got.cards.length === 2), "session, SIAC: read");
  eq([(({ at, ...r }) => r)(got.cards[1]), sim.info.reads, sim.info.acks], [want(SPECS[9]), 8, 2], "session, SIAC: 33 punches, blocks 0, 4, 5");
  sim.remove(); sim.insert(SPECS[7]);
  ok(await until(() => got.cards.length === 3), "session, card 10: read");
  eq([got.cards[2].family, got.cards[2].punches.length, sim.info.reads], ["si10", 3, 10], "session, card 10: 3 punches, blocks 0 and 4");
  sim.remove(); sim.insert(SPECS[3]);
  ok(await until(() => got.cards.length === 4), "session, card 6*: read");
  eq([(({ at, ...r }) => r)(got.cards[3]), sim.info.reads], [want(SPECS[3]), 17], "session, card 6*: 192 punches, blocks 0, 6, 7, 2, 3, 4, 5");
  sim.punch({ code: 45, card: 8001234, t: H(10, 16, 40) + 0.5, dow: 2 });
  ok(await until(() => got.punches.length === 1), "session: a punch sent by itself");
  const { at, ...p } = got.punches[0];
  eq([p, at > 0], [{ code: 45, card: 8001234, t: H(10, 16, 40) + 0.5, dow: 2, mem: 0 }, true], "session: the punch");
  await reader.close();
  eq(got.errors, [], "session: no error");
}
{
  const { sim, got, reader } = await session({ baud: 4800 });
  eq([reader.info().baud, sim.info.baud, got.states], [4800, 4800, ["opening", "ready"]], "session: a station at 4800 baud is found after 38400");
  sim.insert(SPECS[4]);
  ok(await until(() => got.cards.length === 1), "session, card 8 at 4800 baud: read");
  await reader.close();
}
{
  const { sim, got, reader } = await session({ handshake: false, autosend: true });
  eq([sim.info.writes, reader.info().handshake, reader.info().autosend], [[[SYS.PROTOCOL, [0x05]]], true, false], "session: a readout station without handshake gets its protocol byte set");
  sim.insert(SPECS[6]);
  ok(await until(() => got.cards.length === 1 && got.cards[0].family === "pcard"), "session, pCard: read once the station is set");
  await reader.close();
  eq([sim.info.writes, sim.info.memory[SYS.PROTOCOL]], [[[SYS.PROTOCOL, [0x05]], [SYS.PROTOCOL, [0x03]]], 0x03], "session: the protocol byte put back at closing");
  const b = await session({ extended: false }, { configure: false });
  eq([b.sim.info.writes, b.got.errors.map((e) => e.code), b.got.states.at(-1)], [[], ["protocol"], "ready"], "session: with `configure: false` nothing is written, the trouble is said");
  await b.reader.close();
  const c = await session({ mode: MODE.CONTROL, code: 45, extended: true, handshake: false, autosend: true });
  c.sim.punch({ code: 45, card: 2005331, t: H(11) });
  ok(await until(() => c.got.punches.length === 1), "session: a control with autosend is listened to");
  eq([c.sim.info.writes, c.reader.info().modeName, c.got.punches[0].code, c.got.punches[0].card, c.got.punches[0].t], [[], "control", 45, 2005331, H(11)], "session: a control is never written to");
  await c.reader.close();
}
{
  let sim2, once = true;
  const a = await session({ onRead: (k) => { if (k === 4 && once) { once = false; sim2.remove(); } } });
  sim2 = a.sim;
  a.sim.insert(SPECS[9]);
  ok(await until(() => a.got.errors.length === 1 && a.got.states.at(-1) === "ready"), "session: a card taken out while it is read");
  eq([a.got.errors.map((e) => [e.code, e.card, e.message]), a.got.cards.length, a.sim.info.acks], [[["removed", 8001234, "removed"]], 0, 0], "session: `removed`, no read, no beep");
  a.sim.insert(SPECS[9]);
  ok(await until(() => a.got.cards.length === 1), "session: the card put back is read");
  await a.reader.close();
  const b = await session({ nak: 1 });
  b.sim.insert(SPECS[5]);
  ok(await until(() => b.got.cards.length === 1) && b.got.errors.length === 0 && b.sim.info.reads === 3, "session: a block refused once is asked again");
  await b.reader.close();
  const c = await session({ lose: 1 });
  c.sim.insert(SPECS[5]);
  ok(await until(() => c.got.cards.length === 1) && c.got.errors.length === 0 && c.sim.info.reads === 3, "session: a block left unanswered once is asked again");
  await c.reader.close();
  const d = await session({ lose: 99 });
  d.sim.insert(SPECS[5]);
  ok(await until(() => d.got.errors.length === 1), "session: a station that stops answering");
  eq([d.got.errors[0].code, d.got.errors[0].card, d.got.cards.length, d.sim.info.reads, d.sim.info.acks, d.got.states.at(-1)], ["timeout", 1061511, 0, 3, 0, "ready"], "session: `timeout` after three tries");
  await d.reader.close();
}
{
  const a = await session({});
  a.sim.insert({ card: 6000001, family: "tcard" });
  ok(await until(() => a.got.errors.length === 1), "session: a tCard put in");
  eq([a.got.errors[0].code, a.got.errors[0].card, a.got.errors[0].family, a.sim.info.reads], ["unsupported", 6000001, "tcard", 0], "session: `unsupported`, nothing asked");
  await a.reader.close();
  const b = await session({}, { onCard: () => { throw new Error("full"); } });
  b.sim.insert(SPECS[0]);
  ok(await until(() => b.got.errors.length === 1), "session: `onCard` throws");
  eq([b.got.errors[0].code, b.sim.info.acks, b.got.states.at(-1)], ["callback", 0, "ready"], "session: no beep for a read nobody took, the reader goes on");
  b.sim.remove();
  await b.reader.close();
  let stored = false;
  const c = await session({}, { onCard: async () => { await sleep(30); stored = true; }, onState: () => { throw new Error("x"); }, onError: () => { throw new Error("y"); } });
  c.sim.insert(SPECS[0]);
  ok(await until(() => c.sim.info.acks === 1) && stored, "session: the beep waits for `onCard` to be done; callbacks that throw break nothing");
  await c.reader.close();
}
{
  const { sim, got, reader } = await session({ mute: true });
  eq([got.states, reader.info()], [["opening", "listening"], { baud: 38400, listening: true }], "session: a device that answers nothing is listened to at 38400 baud");
  sim.punch({ code: 100, card: 8123456, t: H(14, 30) + 0.25, dow: 0 });
  ok(await until(() => got.punches.length === 1), "session: a radio dongle's punch");
  eq([got.punches[0].code, got.punches[0].card, got.punches[0].t], [100, 8123456, H(14, 30) + 0.25], "session: the dongle's punch");
  let code = "";
  try { await reader.getTime(); } catch (e) { code = e.code; }
  eq(code, "timeout", "session: no clock on a device that only sends");
  await reader.close();
  let failed = "";
  try { await openReader({ open: async () => { throw new Error("busy"); }, write: async () => {}, onData: () => {}, close: async () => {} }, FAST); } catch (e) { failed = e.code; }
  eq(failed, "open", "session: a port that cannot be opened");
}

console.log(fails ? `${fails} of ${n} checks FAILED` : `all ${n} checks passed`);
process.exit(fails ? 1 : 0);
