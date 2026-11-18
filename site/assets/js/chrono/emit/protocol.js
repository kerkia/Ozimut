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
//  · eScan, eScan2 (and Emit's other units of the emiTag family): text messages, 02 · items separated by tabs · 03 0A 0D,
//    each item a letter and its value — the layout Emit prints in the eClock+ manual: a status (« BS ») and an emiTag's
//    passing (« BM »: N tag, C code, E time of day, T the tag's race time…). Only those two are read; what an eScan sends
//    for an e-card's content is in no public document (Emit's eScan2 specification is confidential) and is not decoded.
// Sources: Emit's manuals (MTR4, eScan, eScan2, ETS2, eClock+), the protocol notes and real captures published with an
// open TypeScript library (GPL-3: read for its facts, none of its code or structure is here), and three small readers on
// GitHub that agree with them.

export const XOR_250 = 0xdf, LEN_250 = 217, LEN_MTR_CARD = 234, LEN_MTR_STATUS = 59, SLOTS = 50, TEXT_LEN = 56;
/** How to open the line. A 250 sends two stop bits; one is enough to listen to it, which is what « auto » does. */
const line = (stopBits, baud = 9600) => ({ baud, baudRate: baud, dataBits: 8, parity: "none", stopBits });   // both spellings of the speed
export const SERIAL = { 250: line(2), mtr4: line(1), auto: line(1) };
/**
 * The line of the units that send text messages: 115 200 bit/s, 8 bits, no parity, 1 stop bit — what Emit's manuals give
 * for the ETS2's USB (FTDI) port and the eClock+; taken for the eScan2 (same FTDI driver, same « Protocol » menu), whose
 * own manual gives no speed. The first eScan is a USB CDC device: whatever speed is asked suits it.
 */
export const SERIAL_ESCAN = line(1, 115200);
const LINES = { ...SERIAL, escan: SERIAL_ESCAN };
/** The line to open for a kind of unit ("250" | "mtr4" | "escan" | "auto"); undefined for anything else. */
export const serialOf = (kind) => LINES[kind];
/** Both units carry an FTDI USB-serial chip: this tells them from neither each other nor any other FTDI device. */
export const USB = { vendorId: 0x0403, productId: 0x6001 };
/** The first eScan's own USB ids (a Texas Instruments MSP430 as a CDC serial port; Emit's driver file is « msp430_cdc »). */
export const USB_ESCAN = { vendorId: 0x2047, productId: 0x0300 };
/**
 * What a port's USB ids say (`{ usbVendorId, usbProductId }`, Web Serial's `getInfo()`): "escan" for the first eScan,
 * "ftdi" for a unit behind an FTDI chip — a 250, an MTR4, an eScan2, a time station: the ids cannot tell which —, else null.
 */
export function unitOfUsb(info) {
  const v = info?.usbVendorId ?? info?.vendorId, p = info?.usbProductId ?? info?.productId;
  if (v === USB_ESCAN.vendorId && p === USB_ESCAN.productId) return "escan";
  return v === USB.vendorId ? "ftdi" : null;
}
/** Emit's serial numbers start with the product's number: the names of those its public pages give. */
export const PRODUCTS = { 1260: "eClock+", 8572: "eScan2" };
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

// ---- the text messages: the eScan, the eScan2, the eClock+, the time stations

export const STX = 0x02, ETX = 0x03, MAX_TEXT = 2048;
const secondsOf = (s) => {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})(?:[.,](\d{1,3}))?$/.exec(s ?? "");
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + (m[4] ? Number(m[4].padEnd(3, "0")) / 1000 : 0) : null;
};
const whole = (s) => (/^\d{1,10}$/.test(s ?? "") ? Number(s) : null);
/** Seconds as the messages write a time: « 12:34:56.987 ». */
export function clockText(t) {
  const ms = Math.round(t * 1000), s = Math.floor(ms / 1000);
  return `${two(Math.floor(s / 3600))}:${two(Math.floor(s / 60) % 60)}:${two(s % 60)}.${String(ms % 1000).padStart(3, "0")}`;
}
function parseText(body) {
  let text = "";
  for (const c of body) text += String.fromCharCode(c);
  const items = text.split("\t").filter((s) => s.length).map((s) => { const n = /^LAP[a-z]/.test(s) ? 4 : 1; return [s.slice(0, n), s.slice(n)]; });
  const f = {};
  for (const [k, v] of items) if (!(k in f)) f[k] = v;
  const unit = f.Y ?? null, named = /^(.*?)-HW(.*?)-SW(.*?)-V(.*)$/.exec(f.I ?? "");
  const head = { kind: "text", type: "other", b: f.B ?? null, via: f.Z ?? null, unit, product: (/^\d{5,}$/.test(unit ?? "") && PRODUCTS[unit.slice(0, 4)]) || null,
    code: whole(f.C), msg: whole(f.M), check: f.R ?? null, items };
  if (f.B === "S") return { ...head, type: "status", id: f.I ?? null, name: named ? named[1] : f.I ?? null, hw: named?.[2] ?? null, sw: named?.[3] ?? null,
    version: named?.[4] ?? null, clock: secondsOf(f.W), loop: f.H ?? null, power: f.A ?? null };
  const card = whole(f.N), t = secondsOf(f.E);
  if (f.B === "M" && card != null && head.code != null && t != null) return { ...head, type: "tag", card, t, race: secondsOf(f.T), retries: whole(f.O) };
  return head;
}
/**
 * One whole text message (02 … 03, with or without the 0A 0D that follow) → `{ kind: "text", type, b, via, unit, product,
 * code, msg, check, items: [[key, value]…] }` — `b`: the B item (« S », « M »…), `via`: Z (« USB », « 485 »), `unit`: Y, the
 * sending unit's serial number, `product`: its name when the number's first four digits are known, `msg`: M, a running
 * number, `check`: R as written (its rule is not published: never verified) — and, by `type`:
 *  "status" (B = S): `id` (I: « eClock-HW2-SW2-V1.02 »), `name`, `hw`, `sw`, `version` (its parts), `clock` (W: the unit's
 *    time, s within the day), `loop` (H), `power` (A), as written;
 *  "tag" (B = M with a tag, a code and a time): `card` (N: the emiTag's number), `code` (C: the unit's), `t` (E: the passing,
 *    s within the day, to the millisecond), `race` (T: the tag's own time since its start, s), `retries` (O);
 *  "other": anything else in that frame — an eScan's reading of a card among them: its items are given, nothing is read in them.
 * Or `{ kind: "error", code: "sync" | "length" }`.
 */
export function decodeText(bytes) {
  let end = bytes.length;
  while (end && (bytes[end - 1] === 0x0a || bytes[end - 1] === 0x0d)) end--;
  if (end < 3 || end - 2 > MAX_TEXT) return { kind: "error", code: "length" };
  if (bytes[0] !== STX || bytes[end - 1] !== ETX) return { kind: "error", code: "sync" };
  for (let i = 1; i < end - 1; i++) if (bytes[i] < 0x20 && bytes[i] !== 9) return { kind: "error", code: "sync" };
  return parseText(bytes.subarray(1, end - 1));
}
/** A text message's bytes for `[[key, value]…]`: 02, the items with tabs between them, 03 0A 0D. */
export function encodeText(items) {
  const s = items.map(([k, v]) => `${k}${v ?? ""}`).join("\t");
  if (/[\x00-\x1f]/.test(s.replace(/\t/g, "")) || items.some(([k, v]) => !/^[A-Z]/.test(k) || /\t/.test(`${v ?? ""}`)) || s.length > MAX_TEXT) throw fail("text");
  const b = new Uint8Array(s.length + 4);
  b[0] = STX;
  for (let i = 0; i < s.length; i++) b[i + 1] = s.charCodeAt(i) & 255;
  b.set([ETX, 0x0a, 0x0d], s.length + 1);
  return b;
}
/**
 * The status message of the eClock+ manual: `{ id?, via?, clock (s), msg?, code, unit, loop?, power?, check? }`. `check`
 * is written as given (« 0 » by default): how Emit computes the R item is not published.
 */
export const encodeTextStatus = (spec) => encodeText([["I", spec.id ?? "eClock-HW2-SW2-V1.02"], ["B", "S"], ["Z", spec.via ?? "USB"], ["W", clockText(spec.clock ?? 0)],
  ["M", int(spec.msg ?? 0, 0xffffffff, "msg")], ["C", int(spec.code ?? 0, 255, "code")], ["Y", spec.unit ?? ""], ["H", spec.loop ?? "0x000"],
  ...(spec.power ? [["A", spec.power]] : []), ["R", spec.check ?? "0"]]);
/** The emiTag message of the eClock+ manual: `{ via?, card, unit, msg?, code, t (s within the day), race? (s), retries?, check? }`. */
export const encodeTextTag = (spec) => encodeText([["B", "M"], ["Z", spec.via ?? "USB"], ["N", int(spec.card, 0xffffffff, "card")], ["Y", spec.unit ?? ""],
  ["M", int(spec.msg ?? 0, 0xffffffff, "msg")], ["C", int(spec.code, 255, "code")], ["E", clockText(spec.t)], ["T", clockText(spec.race ?? 0)],
  ["O", int(spec.retries ?? 0, 255, "retries")], ["R", spec.check ?? "0"]]);

// ---- a stream of chunks → messages

/**
 * Bytes as they come, in chunks of any size, → what they carry. `push(chunk)` returns the items completed by it:
 * `{ kind: "card250", … }`, `{ kind: "mtr", type: "card" | "status", … }`, `{ kind: "text", type: "status" | "tag" | "other", … }`
 * (see `decodeCard250`, `decodeMtr`, `decodeText`), and `{ kind: "error", code: "checksum" | "sync", sys?, part? }` once for
 * each run of bytes it had to skip — a frame whose check bytes fail, or bytes that start no frame. After such bytes it
 * looks for the next start one byte further on, so a damaged frame costs that frame only. `kind`: "250", "mtr4", "escan"
 * (the text messages), or "auto" — all three tried, until the first good frame settles it. A text message has no check
 * this code can verify: it is taken when it is whole — 02, a capital letter, then tabs and printable characters only
 * (plain ASCII under « auto ») up to 03, within `MAX_TEXT` bytes; the 0A 0D between two messages are passed over.
 */
export class Decoder {
  constructor({ kind = "auto" } = {}) {
    if (!LINES[kind]) throw fail("kind");
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
      if (this.kind === "escan" && (this.buf[i] === 0x0a || this.buf[i] === 0x0d)) { i++; continue; }   // what ends a text message
      const r = this.#at(i, this.len - i);
      if (r === WAIT) break;
      if (r.item) {
        out.push(r.item); i += r.size; this.frames++; this.lost = false;
        if (this.kind === "auto") this.kind = r.item.kind === "mtr" ? "mtr4" : r.item.kind === "text" ? "escan" : "250";
        continue;
      }
      if (!this.lost) { this.lost = true; out.push({ kind: "error", ...r }); }
      i++; this.skipped++;
    }
    this.buf.copyWithin(0, i, this.len); this.len -= i;
    return out;
  }

  #at(i, n) {
    const k = this.kind, all = k === "auto";
    const r = ((all || k === "mtr4") && this.#mtr(i, n)) || ((all || k === "250") && this.#c250(i, n)) || ((all || k === "escan") && this.#text(i, n, all));
    return r || { code: "sync" };
  }
  #text(i, n, plain) {
    const b = this.buf;
    if (b[i] !== STX) return null;
    if (n < 2) return WAIT;
    if (b[i + 1] < 0x41 || b[i + 1] > 0x5a) return null;                 // an item's letter comes first
    for (let k = 2; k < n; k++) {
      const c = b[i + k];
      if (c === ETX) return { item: parseText(b.subarray(i + 1, i + k)), size: k + 1 };
      if ((c < 0x20 && c !== 9) || (plain && c > 0x7e) || k > MAX_TEXT) return null;
    }
    return WAIT;
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
