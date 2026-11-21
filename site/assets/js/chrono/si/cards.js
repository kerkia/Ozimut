// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// SPORTident cards: which family a number is, which 128-byte blocks to read, and a card's memory as the read design.md
// describes — and the reverse, for the simulator and the tests.
//
// Families decoded: SI5 (one block; 30 punches with a 12-hour time, 6 more with their code only), SI6 and SI6* (block 0,
// then the punches' blocks in the order 6, 7, 2, 3, 4, 5 — so the 192-punch mode too), SI8, SI9, pCard (blocks 0 and 1),
// SI10, SI11 and SIAC (block 0, then 4 to 7). NOT decoded: tCard and fCard (stubs in the sources), a SIAC's battery
// (no source gives its place); `decodeCard` returns null for them.
//
// From card 6 on a time is four bytes — PTD, CN, PTH, PTL: PTD bit 0 the half day, bits 1-3 the weekday (0 = Sunday),
// bits 6-7 the code's bits 8-9; PTH PTL seconds within 12 hours; EE EE = no time. A card 5 has 12-hour times only.
//
// Ported from the MIT-licensed sportident.js (SiCard/types/*.ts: the layouts, the card holder's fields) and GecoSI
// (dataframe/*.java: the half day and the code's high bits, the blocks' order, the card 5's series) — see
// assets/chrono/LICENSE-sportident.txt. Nothing comes from GPL code.

import { cardNumber, cardBytes, NO_TIME, HALF_DAY } from "./protocol.js";

export const BLOCK = 128;
const SI6_ORDER = [6, 7, 2, 3, 4, 5];
/** Cards 8 and later share a header; the punches' place, their number and the series nibble (byte 0x18) differ. */
const MODERN = {
  si8: { at: 0x88, max: 30, series: 2, text: 0x80 }, si9: { at: 0x38, max: 50, series: 1, text: 0x38 }, pcard: { at: 0xB0, max: 20, series: 4, text: 0x38 },
  si10: { at: 0x200, max: 128, series: 15, text: 0xA0 }, si11: { at: 0x200, max: 128, series: 15, text: 0xA0 }, siac: { at: 0x200, max: 128, series: 15, text: 0xA0 },
};
const BY_SERIES = { 1: "si9", 2: "si8", 4: "pcard", 6: "tcard", 15: "si10" };

/** The family of a card number — with the series a station gives when a card 8 or later is put in, if known; null when unknown. */
export function cardFamily(number, series) {
  const n = Number(number), s = series == null ? null : BY_SERIES[series & 15];
  const ten = n >= 9000000 && n < 10000000 ? "si11" : n >= 8000000 && n < 9000000 ? "siac" : "si10";
  if (s) return s === "si10" ? ten : s;
  if (!(n > 0)) return null;
  if (n < 500000) return "si5";
  if (n < 1000000 || (n >= 2003000 && n < 2004000) || (n >= 16711680 && n <= 16777215)) return "si6";
  if (n < 2000000) return "si9";
  if (n < 3000000) return "si8";
  if (n >= 4000000 && n < 5000000) return "pcard";
  if (n >= 6000000 && n < 7000000) return "tcard";
  if (n >= 7000000 && n < 10000000) return ten;
  if (n >= 14000000 && n < 15000000) return "fcard";
  return null;
}

/** The layout's name: the family asked for, else what the card's own series nibble says. */
const nameOf = (family, b0) => (MODERN[family] ? family : MODERN[BY_SERIES[b0?.[0x18] & 15]] ? BY_SERIES[b0[0x18] & 15] : null);
const layoutOf = (family, b0) => MODERN[nameOf(family, b0)] || null;

/**
 * The blocks to read: `blocksOf(family)` what comes first (block 0), `blocksOf(family, block0)` what its punch count
 * still needs, in reading order. A card 5 is one read; an unknown family nothing.
 */
export function blocksOf(family, first) {
  if (!first) return family === "si5" || family === "si6" || MODERN[family] ? [0] : [];
  if (family === "si6") return SI6_ORDER.slice(0, Math.ceil(Math.min(first[0x12], 192) / 32));
  const L = family === "si5" ? null : layoutOf(family, first);
  if (!L) return [];
  const out = [];
  for (let i = 0, n = Math.min(first[0x16], L.max); i < n; i++) {
    for (const a of [L.at + 4 * i, L.at + 4 * i + 3]) { const k = Math.floor(a / BLOCK); if (k && !out.includes(k)) out.push(k); }
  }
  return out;
}

const word = (b, i) => (b[i] << 8) | b[i + 1];
/** A card 5's 12-hour time. */
const t12 = (b, i) => { const s = word(b, i); return s === NO_TIME || s >= HALF_DAY ? null : { t: s, half: true }; };
/** A four-byte time record. */
const rec = (b, i) => { const s = word(b, i + 2); return s === NO_TIME || s >= HALF_DAY ? null : { t: (b[i] & 1) * HALF_DAY + s, dow: (b[i] >> 1) & 7 }; };
const punch = (b, i) => ({ code: ((b[i] & 0xC0) << 2) | b[i + 1], ...(rec(b, i) || { t: null }) });
const text = (b, i, n) => { let s = ""; for (let k = i; k < i + n && k < b.length; k++) s += String.fromCharCode(b[k]); return s.trim(); };

function si5(b) {
  const n = Math.max(0, Math.min(36, b[0x17] - 1)), punches = [];
  for (let i = 0; i < Math.min(n, 30); i++) { const o = 0x21 + Math.floor(i / 5) * 16 + (i % 5) * 3; punches.push({ code: b[o], ...(t12(b, o + 1) || { t: null }) }); }
  for (let i = 30; i < n; i++) punches.push({ code: b[0x20 + (i - 30) * 16], t: null });
  return { sys: "si", card: cardNumber(b[6], b[4], b[5]), family: "si5", start: t12(b, 0x13), finish: t12(b, 0x15), check: t12(b, 0x19), clear: null, punches };
}

function si6(blocks) {
  const b = blocks[0], n = Math.min(b[0x12], 192), punches = [];
  const out = { sys: "si", card: (b[0x0B] << 16) | (b[0x0C] << 8) | b[0x0D], family: "si6", start: rec(b, 0x18), finish: rec(b, 0x14), check: rec(b, 0x1C), clear: rec(b, 0x20), punches };
  for (let i = 0; i < n; i++) {
    const p = blocks[SI6_ORDER[Math.floor(i / 32)]];
    if (!p) { out.partial = true; break; }
    punches.push(punch(p, (i % 32) * 4));
  }
  const owner = { family: text(b, 0x30, 20), given: text(b, 0x44, 20), country: text(b, 0x58, 4), club: text(b, 0x5C, 36) };
  if (Object.values(owner).some(Boolean)) out.owner = owner;
  return out;
}

function modern(family, blocks) {
  const b = blocks[0], L = layoutOf(family, b);
  if (!L) return null;
  const card = (b[0x19] << 16) | (b[0x1A] << 8) | b[0x1B], n = Math.min(b[0x16], L.max), punches = [];
  const fam = L.series === 15 ? cardFamily(card, 15) : nameOf(family, b);
  const out = { sys: "si", card, family: fam, start: rec(b, 0x0C), finish: rec(b, 0x10), check: rec(b, 0x08), clear: null, punches };
  for (let i = 0; i < n; i++) {
    const a = L.at + 4 * i, p = blocks[Math.floor(a / BLOCK)];
    if (!p) { out.partial = true; break; }
    punches.push(punch(p, a % BLOCK));
  }
  // the card holder: « given;family;sex;birth;club;e-mail;phone;city;street;postcode;country », cut where the card is empty;
  // only what a start list can use is kept, never the e-mail, phone or address
  let s = "";
  for (let a = 0x20; a < L.text; a++) { const x = blocks[Math.floor(a / BLOCK)]?.[a % BLOCK]; if (x == null || x === 0xEE || x === 0) break; s += String.fromCharCode(x); }
  const f = s.split(";"), owner = {};
  for (const [k, i] of [["given", 0], ["family", 1], ["sex", 2], ["birth", 3], ["club", 4], ["country", 10]]) if (i < f.length - 1 && f[i].trim()) owner[k] = f[i].trim();
  if (Object.keys(owner).length) out.owner = owner;
  return out;
}

/**
 * A card's memory as a read: `blocks` holds each 128-byte block under its number (`{ 0: …, 4: … }` or an array); a
 * card 5 has block 0 alone. `{ sys: "si", card, family, start, finish, check, clear, punches: [{ code, t, dow?, half? }],
 * owner?, partial? }` — each time `{ t, dow }` (seconds after midnight), on a card 5 `{ t, half: true }` (within its
 * 12 hours), or null; a punch without a time has `t: null`; `partial` when a block its punches need is missing.
 * Null when block 0 is missing or the family is not decoded (tCard, fCard).
 */
export function decodeCard(family, blocks) {
  const b = blocks?.[0];
  if (!b || b.length < BLOCK) return null;
  return family === "si5" ? si5(b) : family === "si6" ? si6(blocks) : modern(family, blocks);
}

// ---- the reverse

const fail = (code) => Object.assign(new Error(code), { code });
const put = (b, i, ...v) => { for (const x of v) b[i++] = x; };
const fill = (v) => new Uint8Array(BLOCK).fill(v);
const tOf = (x) => (x == null ? null : typeof x === "number" ? x : x.t);
/** A four-byte time record for a code and a time (null: EE EE EE EE). */
function recBytes(x, dow, code = 0) {
  const t = tOf(x);
  if (t == null) return code ? [(code >> 2) & 0xC0, code & 0xFF, 0xEE, 0xEE] : [0xEE, 0xEE, 0xEE, 0xEE];
  const s = Math.floor(t) % 86400, h = s % HALF_DAY;
  return [((code >> 2) & 0xC0) | (((x.dow ?? dow) & 7) << 1) | (s >= HALF_DAY ? 1 : 0), code & 0xFF, h >> 8, h & 0xFF];
}
const ascii = (b, i, s, n) => { for (let k = 0; k < n; k++) b[i + k] = k < s.length ? s.charCodeAt(k) & 0xFF : 0x20; };

/**
 * A card's memory from `{ card, family, start, finish, check, clear, punches: [{ code, t }], dow?, owner? }` — times in
 * seconds after midnight (or `{ t, dow }`), `dow` the weekday written with them: the blocks under their numbers, as
 * `decodeCard` takes them. Families: si5, si6, si8, si9, pcard, si10, si11, siac.
 */
export function encodeCard(spec) {
  const family = spec.family || cardFamily(spec.card), dow = spec.dow ?? 0, P = spec.punches || [], [s2, s1, s0] = cardBytes(spec.card);
  if (family === "si5") {
    if (P.length > 36) throw fail("punches");
    const b = new Uint8Array(BLOCK), t = (x) => { const v = tOf(x); return v == null ? [0xEE, 0xEE] : [(Math.floor(v) % HALF_DAY) >> 8, Math.floor(v) % HALF_DAY & 0xFF]; };
    put(b, 0, 0xAA, 0x2E, 0x00, 0x01, s1, s0, s2);
    put(b, 0x10, 0x65, s1, s0, ...t(spec.start), ...t(spec.finish), P.length + 1, 0x56, ...t(spec.check), 0x28, 0x03, 0xA6, 0x00, 0x07);
    for (let i = 0; i < 30; i++) put(b, 0x21 + Math.floor(i / 5) * 16 + (i % 5) * 3, i < P.length ? P[i].code & 0xFF : 0, ...t(i < P.length ? P[i] : null));
    for (let i = 30; i < P.length; i++) b[0x20 + (i - 30) * 16] = P[i].code & 0xFF;
    return { 0: b };
  }
  if (family === "si6") {
    if (P.length > 192) throw fail("punches");
    const b = new Uint8Array(BLOCK), last = P[P.length - 1], o = spec.owner || {}, out = { 0: b };
    put(b, 0, 0x01, 0x01, 0x01, 0x01, 0xED, 0xED, 0xED, 0xED, 0x55, 0xAA, 0x00, s2, s1, s0);
    put(b, 0x10, last ? (last.code >> 2) & 0xC0 : 0, last ? last.code & 0xFF : 0, P.length, P.length + 1,
      ...recBytes(spec.finish, dow), ...recBytes(spec.start, dow), ...recBytes(spec.check, dow), ...recBytes(spec.clear, dow), 0xEE, 0xEE, 0xEE, 0xEE, 0, 0, 0, 0);
    ascii(b, 0x2C, "", 4); ascii(b, 0x30, o.family || "", 20); ascii(b, 0x44, o.given || "", 20); ascii(b, 0x58, o.country || "", 4); ascii(b, 0x5C, o.club || "", 36);
    for (const k of SI6_ORDER.slice(0, Math.max(2, Math.ceil(P.length / 32)))) out[k] = fill(0xEE);
    P.forEach((p, i) => put(out[SI6_ORDER[Math.floor(i / 32)]], (i % 32) * 4, ...recBytes(p, dow, p.code)));
    return out;
  }
  const L = MODERN[family];
  if (!L) throw fail("family");
  if (P.length > L.max) throw fail("punches");
  const out = { 0: fill(0xEE) }, b = out[0], o = spec.owner || {};
  if (L.at >= 0x200) for (let k = 4; k < 8; k++) out[k] = fill(0xEE); else out[1] = fill(0xEE);
  put(b, 0, 0x4F, 0x5A, s1, s0, 0xEA, 0xEA, 0xEA, 0xEA, ...recBytes(spec.check, dow), ...recBytes(spec.start, dow), ...recBytes(spec.finish, dow),
    0x00, 0x00, P.length, 0x00, L.series, s2, s1, s0, 0x0C, 0xFF, 0x00, 0x00);
  const s = o.given || o.family ? `${o.given || ""};${o.family || ""};` : "";
  for (let i = 0; i < s.length && 0x20 + i < Math.min(L.text, BLOCK); i++) b[0x20 + i] = s.charCodeAt(i) & 0xFF;
  P.forEach((p, i) => { const a = L.at + 4 * i; put(out[Math.floor(a / BLOCK)], a % BLOCK, ...recBytes(p, dow, p.code)); });
  return out;
}
