// Emit's EPT e-cards on the wire: what the « 250 » reader and the MTR4 send down their serial line, and what the MTR4 takes.
// Pure: bytes in, objects out, and back (the encoders feed the simulator). Nothing here judges a race.
//
// Every fact, with its source and how sure it is: docs/chrono/emit.md. In short —
//  · 250 reader: 9600 baud 8N2, sends only; a card lying on it is sent again and again as 217 bytes, each XOR-ed with 0xDF:
//    FF FF · card number (3, LSB first) · 0 · production week · year · 0 · head check (bytes 3-10 sum to 0 mod 256) ·
//    50 × (control code, time in seconds LSB first) · 56 bytes of text · check (the 217 bytes sum to 0 mod 256).
//  · MTR4: 9600 baud 8N1, not XOR-ed; messages start FF FF FF FF · size (the bytes after the preamble) · type:
//    « M » (234 bytes) one card read with the unit's clock and a package number, « S » (59 bytes) its status;
//    commands « /ST », « /SA », « /SBxxxx », « /GBxxxx », « /NS », « /SCymdhms », « /CL », no terminator.
// Sources: Emit's manuals (MTR4, eScan2), the protocol notes and real captures published with an open TypeScript library
// (GPL-3: read for its facts, none of its code or structure is here), and three small readers on GitHub that agree with them.

export const XOR_250 = 0xdf, LEN_250 = 217, LEN_MTR_CARD = 234, LEN_MTR_STATUS = 59, SLOTS = 50, TEXT_LEN = 56;
/** How to open the line. A 250 sends two stop bits; one is enough to listen to it, which is what « auto » does. */
const line = (stopBits) => ({ baud: 9600, baudRate: 9600, dataBits: 8, parity: "none", stopBits });   // both spellings of the speed
export const SERIAL = { 250: line(2), mtr4: line(1), auto: line(1) };
/** Both units carry an FTDI USB-serial chip: this tells them from neither each other nor any other FTDI device. */
export const USB = { vendorId: 0x0403, productId: 0x6001 };
/** Codes a card can hold that are no course control: the start unit, a low-battery mark, the reading units (A-D). */
export const CODE = { START: 0, LOW_BATTERY: 99, READER: 250, READER_LAST: 253 };
export const isReaderCode = (code) => code >= CODE.READER && code <= CODE.READER_LAST;

const WAIT = Symbol("wait");
const WIRE_FF = 0xff ^ XOR_250;                              // a 250's start bytes as they travel: two spaces
const MTR_TYPE = { 230: 0x4d, 55: 0x53 };                    // package size → package type (« M », « S »)
const fail = (code) => Object.assign(new Error(code), { code });
const sum = (b, from, to) => { let s = 0; for (let i = from; i < to; i++) s += b[i]; return s & 255; };
const u16 = (b, i) => b[i] | (b[i + 1] << 8);
const u24 = (b, i) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const u32 = (b, i) => (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
const put16 = (b, i, v) => { b[i] = v & 255; b[i + 1] = (v >>> 8) & 255; };
const put32 = (b, i, v) => { put16(b, i, v & 0xffff); put16(b, i + 2, (v >>> 16) & 0xffff); };
const int = (v, max, code) => { if (!Number.isInteger(v) || v < 0 || v > max) throw fail(code); return v; };
const two = (n) => String(n).padStart(2, "0");

// ---- what both units carry: the card's 50 places and its 56 bytes of text

function readSlots(b, at) {
  const out = [];
  for (let i = 0; i < SLOTS; i++) out.push([b[at + 3 * i], u16(b, at + 3 * i + 1)]);
  return out;
}
/**
 * The places in use, in the card's order: every one up to the last that is not (code 0, time 0), as `{ code, t }` — raw:
 * the start unit's 0, the 99 marks and the reading units' codes are all there, and a (0, 0) between two others stays.
 */
export function punchesOf(slots) {
  let n = slots.length;
  while (n && !slots[n - 1][0] && !slots[n - 1][1]) n--;
  return slots.slice(0, n).map(([code, t]) => ({ code, t }));
}
function writeSlots(b, at, punches = []) {
  if (punches.length > SLOTS) throw fail("slots");
  punches.forEach((p, i) => { b[at + 3 * i] = int(p.code, 255, "code"); put16(b, at + 3 * i + 1, int(p.t, 0xffff, "time")); });
}
function readText(b, at) {
  const ascii = b.slice(at, at + TEXT_LEN);
  let s = "";
  for (const c of ascii) { if (c < 0x20 || c > 0x7e) break; s += String.fromCharCode(c); }   // newer cards end it with FF 00 FF 00…
  const m = /S(\d{4})P(\d{4})L(\d{4})/.exec(s);
  return { text: s.trimEnd(), counters: m ? { s: Number(m[1]), p: Number(m[2]), l: Number(m[3]) } : null, ascii };
}
function writeText(b, at, spec) {
  if (spec.ascii) { b.fill(0x20, at, at + TEXT_LEN); b.set(Uint8Array.from(spec.ascii).subarray(0, TEXT_LEN), at); return; }
  const s = String(spec.text ?? "").slice(0, TEXT_LEN).padEnd(TEXT_LEN, " ");
  for (let i = 0; i < TEXT_LEN; i++) b[at + i] = s.charCodeAt(i) & 0x7f;
}
/**
 * The 56 characters a card of 1998 or later says: its name (32), a display field (8), then its counters — S: disturbances
 * that woke it, P: tests (put back to sleep by a reader within 4 minutes), L: times it stayed awake longer (its races).
 */
export function cardText({ name = "EMIT EPT SYS VER 2", disp = "DISP-1", s = 0, p = 0, l = 0 } = {}) {
  const n4 = (x) => String(Math.min(9999, Math.max(0, Math.trunc(x) || 0))).padStart(4, "0");
  return `${String(name).slice(0, 32).padEnd(32, " ")}${String(disp).slice(0, 8).padEnd(8, " ")}S${n4(s)}P${n4(p)}L${n4(l)} `;
}

/**
 * Where the race lies among a card's punches, by Emit's own rule (the MTR4 manual): from the LAST start punch (code 0) to
 * the last punch before the FIRST reading unit's code after it. Indexes, −1 for none: `zero`, `finish`, `reader`.
 * `live`: that reading unit's punch is the card's last one, so this very read is the first since the race and the moment
 * of the read (`readAt`, else `at`) is the card's time `punches[reader].t`. Later readings add codes whose times count
 * from another zero (seen on real cards), and say nothing of the race.
 */
export function raceSpan(punches) {
  let zero = -1, reader = -1;
  punches.forEach((p, i) => { if (p.code === CODE.START) zero = i; });
  for (let i = zero + 1; i < punches.length && reader < 0; i++) if (isReaderCode(punches[i].code)) reader = i;
  const end = reader < 0 ? punches.length : reader;
  return { zero, finish: end - 1 > zero ? end - 1 : -1, reader, live: reader >= 0 && reader === punches.length - 1 };
}

// ---- the 250 reader

/** The 217 bytes a 250 reader sends for `{ card, week?, year?, punches: [{ code, t }], text? | ascii? }`, as on the wire. */
export function encodeCard250(spec) {
  const b = new Uint8Array(LEN_250);
  b[0] = b[1] = 0xff;
  const card = int(spec.card, 0xffffff, "card");
  b[2] = card & 255; b[3] = (card >> 8) & 255; b[4] = card >> 16;
  b[6] = int(spec.week ?? 0, 255, "week"); b[7] = int(spec.year ?? 0, 255, "year");
  b[9] = (256 - sum(b, 2, 9)) & 255;
  writeSlots(b, 10, spec.punches);
  writeText(b, 160, spec);
  b[216] = (256 - sum(b, 0, 216)) & 255;
  for (let i = 0; i < LEN_250; i++) b[i] ^= XOR_250;
  return b;
}
const check250 = (f) => (sum(f, 2, 10) ? "head" : sum(f, 0, LEN_250) ? "sum" : null);
function parse250(f) {
  const slots = readSlots(f, 10);
  return { kind: "card250", card: u24(f, 2), week: f[6], year: f[7], slots, punches: punchesOf(slots), ...readText(f, 160) };
}
/** One whole frame off the wire → `{ kind: "card250", card, week, year, slots, punches, text, counters, ascii }`, or `{ kind: "error", code, part? }`. */
export function decodeCard250(wire) {
  if (wire.length !== LEN_250) return { kind: "error", code: "length" };
  const f = Uint8Array.from(wire, (x) => x ^ XOR_250);
  if (f[0] !== 0xff || f[1] !== 0xff) return { kind: "error", code: "sync" };
  const part = check250(f);
  return part ? { kind: "error", code: "checksum", part } : parse250(f);
}

// ---- the MTR4

/** A Date's local fields as the MTR counts time: `{ y, mo, d, h, mi, s }`. */
export const stampOf = (date) => ({ y: date.getFullYear(), mo: date.getMonth() + 1, d: date.getDate(), h: date.getHours(), mi: date.getMinutes(), s: date.getSeconds() });
function readStamp(b, at) {
  const st = { y: (b[at] >= 90 ? 1900 : 2000) + b[at], mo: b[at + 1], d: b[at + 2], h: b[at + 3], mi: b[at + 4], s: b[at + 5] };
  return { stamp: st, date: `${st.y}-${two(st.mo)}-${two(st.d)}`, clock: st.h * 3600 + st.mi * 60 + st.s };
}
function writeStamp(b, at, t) {
  [int(t.y, 9999, "time") % 100, int(t.mo, 12, "time"), int(t.d, 31, "time"), int(t.h, 23, "time"), int(t.mi, 59, "time"), int(t.s, 59, "time")]
    .forEach((v, i) => { b[at + i] = v; });
}
function mtrFrame(len, type, spec) {
  const b = new Uint8Array(len);
  b.fill(0xff, 0, 4); b[4] = len - 4; b[5] = type;
  put16(b, 6, int(spec.id ?? 0, 0xffff, "id"));
  writeStamp(b, 8, spec.stamp);
  put16(b, 14, int(spec.ms ?? 0, 0xffff, "time"));
  return b;
}
const mtrSeal = (b) => { b[b.length - 2] = sum(b, 0, b.length - 2); return b; };   // then one 0: five FF in a row never happen

/** The 234 bytes an MTR sends for a card read: `{ id, stamp, pack, card, week?, year?, punches, text? | ascii? }`. */
export function encodeMtrCard(spec) {
  const b = mtrFrame(LEN_MTR_CARD, 0x4d, spec);
  put32(b, 16, int(spec.pack ?? 1, 0xffffffff, "pack"));
  const card = int(spec.card, 0xffffff, "card");
  b[20] = card & 255; b[21] = (card >> 8) & 255; b[22] = card >> 16;
  b[23] = int(spec.week ?? 0, 255, "week"); b[24] = int(spec.year ?? 0, 255, "year");
  b[25] = (256 - sum(b, 20, 25)) & 255;
  writeSlots(b, 26, spec.punches);
  writeText(b, 176, spec);
  return mtrSeal(b);
}
/** The 59 bytes of an MTR's status: `{ id, stamp, lowBattery?, recent?, oldest?, sessions?: [current, previous 1…7] }`. */
export function encodeMtrStatus(spec) {
  const b = mtrFrame(LEN_MTR_STATUS, 0x53, spec);
  b[16] = spec.lowBattery ? 1 : 0;
  put32(b, 17, spec.recent ?? 0); put32(b, 21, spec.oldest ?? 1);
  for (let i = 0; i < 8; i++) put32(b, 25 + 4 * i, spec.sessions?.[i] ?? 0);
  return mtrSeal(b);
}
function parseMtr(f) {
  const head = { kind: "mtr", id: u16(f, 6), ...readStamp(f, 8), ms: u16(f, 14) };
  if (f[5] === 0x53) {
    const sessions = [];
    for (let i = 0; i < 8; i++) sessions.push(u32(f, 25 + 4 * i));
    return { ...head, type: "status", lowBattery: f[16] === 1, battery: f[16], recent: u32(f, 17), oldest: u32(f, 21), sessions };
  }
  const slots = readSlots(f, 26), { clock, ...rest } = head;
  return { ...rest, type: "card", readAt: clock, pack: u32(f, 16), card: u24(f, 20), week: f[23], year: f[24], headOk: sum(f, 20, 26) === 0,
    slots, punches: punchesOf(slots), ...readText(f, 176) };
}
/**
 * One whole MTR message → `{ kind: "mtr", type: "card", id, stamp, date, readAt (the unit's clock, s within the day), pack,
 * card, week, year, headOk, slots, punches, text, counters, ascii }` or `{ kind: "mtr", type: "status", id, stamp, date,
 * clock, lowBattery, recent, oldest, sessions }`, or `{ kind: "error", code }`.
 */
export function decodeMtr(bytes) {
  const size = bytes.length;
  if (size < 6 || MTR_TYPE[bytes[4]] !== bytes[5] || size !== 4 + bytes[4]) return { kind: "error", code: "length" };
  for (let i = 0; i < 4; i++) if (bytes[i] !== 0xff) return { kind: "error", code: "sync" };
  if (sum(bytes, 0, size - 2) !== bytes[size - 2]) return { kind: "error", code: "checksum", part: "sum" };
  return parseMtr(bytes);
}

const COMMANDS = { status: "ST", spoolAll: "SA", spoolFrom: "SB", getOne: "GB", newSession: "NS", setClock: "SC", clear: "CL" };
const tailOf = (name) => (name === "spoolFrom" || name === "getOne" ? 4 : name === "setClock" ? 6 : 0);
/**
 * A command for an MTR: `status`; `spoolAll`; `spoolFrom`, n (every message from package n on); `getOne`, n; `newSession`;
 * `setClock`, { y, mo, d, h, mi, s }; `clear` (empties its memory: nothing here sends it but the simulator's tests).
 */
export function mtrCommand(name, arg) {
  const c = COMMANDS[name];
  if (!c) throw fail("command");
  const b = new Uint8Array(3 + tailOf(name));
  b[0] = 0x2f; b[1] = c.charCodeAt(0); b[2] = c.charCodeAt(1);
  if (b.length === 7) put32(b, 3, int(arg, 0xffffffff, "pack")); else if (b.length === 9) writeStamp(b, 3, arg);
  return b;
}
/** The command starting at `b[at]`, as an MTR would take it: `{ name, arg?, size }`; null when none starts there, undefined while it is incomplete. */
export function readMtrCommand(b, at = 0) {
  if (b[at] !== 0x2f) return null;
  if (b.length - at < 3) return undefined;
  const letters = String.fromCharCode(b[at + 1], b[at + 2]), name = Object.keys(COMMANDS).find((k) => COMMANDS[k] === letters);
  if (!name) return null;
  const size = 3 + tailOf(name);
  if (b.length - at < size) return undefined;
  const arg = size === 7 ? u32(b, at + 3) : size === 9 ? readStamp(b, at + 3).stamp : undefined;
  return { name, ...(arg !== undefined && { arg }), size };
}

// ---- a stream of chunks → messages

/**
 * Bytes as they come, in chunks of any size, → what they carry. `push(chunk)` returns the items completed by it:
 * `{ kind: "card250", … }`, `{ kind: "mtr", type: "card" | "status", … }` (see `decodeCard250`, `decodeMtr`), and
 * `{ kind: "error", code: "checksum" | "sync", sys?, part? }` once for each run of bytes it had to skip — a frame whose
 * check bytes fail, or bytes that start no frame. After such bytes it looks for the next start one byte further on, so a
 * damaged frame costs that frame only. `kind`: "250", "mtr4", or "auto" — both tried, until the first good frame settles it.
 */
export class Decoder {
  constructor({ kind = "auto" } = {}) {
    if (!SERIAL[kind]) throw fail("kind");
    this.kind = kind; this.buf = new Uint8Array(512); this.len = 0; this.lost = false; this.frames = 0; this.skipped = 0;
  }
  /** Bytes held, waiting for the rest of a frame. */
  get pending() { return this.len; }
  /** Forget them (the line went quiet in mid-frame); how many there were. */
  reset() { const n = this.len; this.len = 0; this.lost = false; return n; }

  push(chunk) {
    if (this.len + chunk.length > this.buf.length) {
      const wider = new Uint8Array(Math.max(2 * this.buf.length, this.len + chunk.length));
      wider.set(this.buf.subarray(0, this.len)); this.buf = wider;
    }
    this.buf.set(chunk, this.len); this.len += chunk.length;
    const out = [];
    let i = 0;
    while (i < this.len) {
      const r = this.#at(i, this.len - i);
      if (r === WAIT) break;
      if (r.item) {
        out.push(r.item); i += r.size; this.frames++; this.lost = false;
        if (this.kind === "auto") this.kind = r.item.kind === "mtr" ? "mtr4" : "250";
        continue;
      }
      if (!this.lost) { this.lost = true; out.push({ kind: "error", ...r }); }
      i++; this.skipped++;
    }
    this.buf.copyWithin(0, i, this.len); this.len -= i;
    return out;
  }

  #at(i, n) {
    const r = (this.kind !== "250" && this.#mtr(i, n)) || (this.kind !== "mtr4" && this.#c250(i, n));
    return r || { code: "sync" };
  }
  #mtr(i, n) {
    const b = this.buf;
    for (let k = 0; k < 4; k++) { if (k >= n) return WAIT; if (b[i + k] !== 0xff) return null; }
    if (n < 5) return WAIT;
    const type = MTR_TYPE[b[i + 4]];
    if (type === undefined) return null;
    if (n < 6) return WAIT;
    if (b[i + 5] !== type) return null;
    const size = 4 + b[i + 4];
    if (n < size) return WAIT;
    if (sum(b, i, i + size - 2) !== b[i + size - 2]) return { code: "checksum", sys: "mtr", part: "sum" };
    return { item: parseMtr(b.slice(i, i + size)), size };
  }
  #c250(i, n) {
    const b = this.buf;
    if (b[i] !== WIRE_FF) return null;
    if (n < 2) return WAIT;
    if (b[i + 1] !== WIRE_FF) return null;
    if (n < LEN_250) return WAIT;
    const f = Uint8Array.from(b.subarray(i, i + LEN_250), (x) => x ^ XOR_250), part = check250(f);
    return part ? { code: "checksum", sys: "250", part } : { item: parse250(f), size: LEN_250 };
  }
}
