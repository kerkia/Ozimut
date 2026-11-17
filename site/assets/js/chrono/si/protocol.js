// SPORTident's serial protocol: framing, the CRC, the commands a readout needs and the fixed layouts of their answers.
//
// A frame of the extended protocol is  [WAKEUP] STX cmd len data… crcHi crcLo ETX  (the CRC over cmd, len and data); every
// answer of a station starts its data with its own code (CN1, CN0). ACK and NAK travel alone, as one byte. The legacy
// protocol — commands under 0x80 — has neither length nor CRC:  STX cmd data… ETX, each data byte under 0x20 preceded by DLE.
//
// Ported from the MIT-licensed sportident.js (constants.ts, siProtocol.ts, SiStation/BaseSiStation.ts, ISiStation.ts),
// lool-ing/sportident (autosend.ts) and GecoSI (SiMessage.java, SiDriverState.java) — see assets/chrono/LICENSE-sportident.txt.
// The legacy framing is the protocol's public description; none of this comes from GPL code.

export const WAKEUP = 0xFF, STX = 0x02, ETX = 0x03, ACK = 0x06, NAK = 0x15, DLE = 0x10;

/** Commands of the extended protocol. */
export const CMD = {
  GET_BACKUP: 0x81, SET_SYS_VAL: 0x82, GET_SYS_VAL: 0x83,
  SRR_WRITE: 0xA2, SRR_READ: 0xA3, SRR_QUERY: 0xA6, SRR_PING: 0xA7, SRR_ADHOC: 0xA8,
  GET_SI5: 0xB1,                        // a card 5's 128 bytes
  TRANS_REC: 0xD3,                      // a punch sent by itself (a control with « autosend », a radio dongle)
  CLEAR_CARD: 0xE0, GET_SI6: 0xE1, SET_SI6: 0xE2, SET_SI6_SPECIAL: 0xE4,
  SI5_DET: 0xE5, SI6_DET: 0xE6, SI_REM: 0xE7, SI8_DET: 0xE8,   // a card put in, taken out
  SET_SI8: 0xEA, GET_SI8: 0xEF,         // a block of a card 8, 9, 10, 11, SIAC, pCard, tCard
  SET_MS: 0xF0, GET_MS: 0xF1, ERASE_BDATA: 0xF5, SET_TIME: 0xF6, GET_TIME: 0xF7, OFF: 0xF8, SIGNAL: 0xF9, SET_BAUD: 0xFE,
};
/** Commands of the legacy protocol (a station whose « extended protocol » is off sends these). */
export const LEGACY = {
  SET_CARDNO: 0x30, GET_SI5: 0x31, SI5_WRITE: 0x43, SI5_DET: 0x46, TRANS_REC: 0x53, TRANS_TIME: 0x54, GET_SI6: 0x61, SI6_DET: 0x66,
  SET_MS: 0x70, GET_MS: 0x71, SET_SYS_VAL: 0x72, GET_SYS_VAL: 0x73, GET_BDATA: 0x74, ERASE_BDATA: 0x75, SET_TIME: 0x76, GET_TIME: 0x77,
  OFF: 0x78, GET_BDATA2: 0x7A, SET_BAUD: 0x7E,
};
/** SET_MS: talk to the station on the cable itself (direct, « M ») or to the one coupled on top of it (remote, « S »). */
export const MS_DIRECT = 0x4D, MS_REMOTE = 0x53;

/** Places in a station's system data (GET_SYS_VAL, 0x00-0x7F). */
export const SYS = { SERIAL: 0x00, FIRMWARE: 0x05, BUILD: 0x08, MODEL: 0x0B, MEMORY: 0x0D, BATTERY_DATE: 0x15, BATTERY_CAP: 0x19,
  SI6_MODE: 0x33, BATTERY_USED: 0x34, PROGRAM: 0x70, MODE: 0x71, CODE: 0x72, SIGNALS: 0x73, PROTOCOL: 0x74, LAST_WRITE: 0x75, SIZE: 0x80 };
/** Bits of the protocol byte (0x74). */
export const FLAG = { EXTENDED: 0x01, AUTOSEND: 0x02, HANDSHAKE: 0x04, SPRINT: 0x08, PASSWORD: 0x10, STOP_FULL: 0x20, AUTO_READOUT: 0x80 };
export const MODE = { SIAC1: 0x01, CONTROL: 0x02, START: 0x03, FINISH: 0x04, READOUT: 0x05, CLEAR: 0x07, CHECK: 0x0A, PRINT: 0x0B,
  START_TRIGGER: 0x0C, FINISH_TRIGGER: 0x0D, SIAC2: 0x11, BC_CONTROL: 0x12, BC_START: 0x13, BC_FINISH: 0x14, BC_SLAVE: 0x1F,
  BEACON_CONTROL: 0x32, BEACON_START: 0x33, BEACON_FINISH: 0x34 };
const MODE_NAME = Object.fromEntries(Object.entries(MODE).map(([k, v]) => [v, k.toLowerCase()]));
const MODEL_NAME = { 0x8003: "BSF3", 0x8004: "BSF4", 0x8115: "BSF5", 0x8146: "BSF6", 0x8117: "BSF7", 0x8197: "BSF7", 0x8118: "BSF8", 0x8198: "BSF8",
  0x8187: "BS7 Master", 0x8188: "BS8 Master", 0x8084: "BSM4", 0x8086: "BSM6", 0x9197: "BSM7", 0x9198: "BSM8", 0x9597: "BS7-S", 0xB197: "BS7-P",
  0xB897: "BS7-GSM", 0xB198: "BS8-P" };

export const NO_TIME = 0xEEEE, HALF_DAY = 43200;

/** Anything byte-like as a Uint8Array. */
export const bytes = (x) => (x instanceof Uint8Array ? x : Uint8Array.from(x || []));

/**
 * SPORTident's CRC over `data` (a number, 0-0xFFFF): polynomial 0x8005, the register seeded with the first two bytes, the
 * rest taken as 16-bit words after one (odd length) or two (even) zero bytes. Under two bytes: the bytes themselves.
 */
export function crc(data) {
  const b = bytes(data), n = b.length;
  if (n < 2) return n ? b[0] << 8 : 0;
  let c = (b[0] << 8) | b[1];
  if (n === 2) return c;
  const end = n + (n % 2 ? 1 : 2);
  for (let i = 2; i < end; i += 2) {
    let w = ((i < n ? b[i] : 0) << 8) | (i + 1 < n ? b[i + 1] : 0);
    for (let j = 0; j < 16; j++) {
      const top = c & 0x8000;
      c = ((c << 1) & 0xFFFF) | (w & 0x8000 ? 1 : 0);
      if (top) c ^= 0x8005;
      w = (w << 1) & 0xFFFF;
    }
  }
  return c;
}

/**
 * A frame for `cmd` and its `data`: extended protocol from 0x80 up, legacy under it; `cmd` ACK or NAK is the lone byte.
 * `wake` puts the wake-up byte in front, as a computer does before each command.
 */
export function encode(cmd, data = [], { wake = false } = {}) {
  const d = bytes(data), out = wake ? [WAKEUP] : [];
  if (cmd === ACK || cmd === NAK) out.push(cmd);
  else if (cmd >= 0x80) {
    if (d.length > 255) throw new RangeError("data too long");
    const body = [cmd, d.length, ...d], c = crc(body);
    out.push(STX, ...body, c >> 8, c & 0xFF, ETX);
  } else {
    out.push(STX, cmd);
    for (const x of d) { if (x < 0x20) out.push(DLE); out.push(x); }
    out.push(ETX);
  }
  return Uint8Array.from(out);
}

/**
 * Bytes in, messages out, whatever the chunks: `push(chunk)` returns the messages completed —
 * `{ cmd, data, stationCode? }` (`stationCode` from the first two data bytes of a station's answer; `legacy: true` for a
 * legacy frame, `bare: true` for a lone ACK or NAK). Wake-up bytes and anything between frames are skipped (`skipped`);
 * a frame whose CRC is wrong is dropped whole, one whose end is not where its length says is searched again from its
 * second byte (both counted in `bad`); a frame left unfinished for `stale` ms is given up when more bytes come.
 * `from: "host"` reads a computer's commands (no station code).
 */
export class Decoder {
  constructor({ from = "station", stale = 1500, now = Date.now } = {}) {
    this.host = from === "host"; this.stale = stale; this.now = now;
    this.reset();
  }
  reset() { this.buf = []; this.since = 0; this.skipped = 0; this.bad = 0; }
  push(chunk) {
    const buf = this.buf, out = [];
    if (buf.length && this.now() - this.since > this.stale) { buf.shift(); this.bad++; }
    for (const x of bytes(chunk)) buf.push(x);
    for (;;) {
      const m = this.take();
      if (m === null) break;
      if (m) out.push(m);
    }
    this.since = buf.length ? this.since || this.now() : 0;
    return out;
  }
  /** One step: a message, undefined when bytes were dropped, null when more are needed. */
  take() {
    const b = this.buf;
    if (!b.length) return null;
    const done = (n, m) => { b.splice(0, n); this.since = 0; return m; };
    if (b[0] === ACK || b[0] === NAK) return done(1, { cmd: b[0], data: new Uint8Array(0), bare: true });
    if (b[0] !== STX) { if (b[0] !== WAKEUP) this.skipped++; return done(1); }
    if (b.length < 2) return null;
    const cmd = b[1];
    if (cmd === STX || cmd < 0x20 || cmd === WAKEUP) { if (cmd !== STX) this.skipped++; return done(1); }   // « FF 02 02 … »: a second STX starts over
    if (cmd < 0x80) {                                           // legacy: up to the first ETX that no DLE protects
      const data = [];
      for (let i = 2; i < b.length; i++) {
        if (b[i] === DLE) { if (i + 1 >= b.length) return null; data.push(b[++i]); }
        else if (b[i] === ETX) return done(i + 1, { cmd, data: Uint8Array.from(data), legacy: true });
        else data.push(b[i]);
        if (data.length > 300) { this.bad++; return done(1); }
      }
      return null;
    }
    if (b.length < 3) return null;
    const n = b[2], total = n + 6;
    if (b.length < total) return null;
    const got = (b[total - 3] << 8) | b[total - 2];
    if (b[total - 1] !== ETX) { this.bad++; return done(1); }                 // no frame started here: look on from the next byte
    if (crc(b.slice(1, 3 + n)) !== got) { this.bad++; return done(total); }   // a frame, damaged: all of it goes
    const data = Uint8Array.from(b.slice(3, 3 + n)), m = { cmd, data };
    if (!this.host && n >= 2) m.stationCode = (data[0] << 8) | data[1];
    return done(total, m);
  }
}

// ---- card numbers

/**
 * A card's number from the three bytes stations and cards carry (SI2, SI1, SI0). Cards 5 keep a series and a 16-bit
 * number — series 2 to 4 add 200 000 to 400 000, series 0 and 1 nothing (GecoSI's rule; its recorded card 36353 has
 * series 1) —, every later card a plain 24-bit number.
 */
export const cardNumber = (si2, si1, si0) => (si2 <= 4 ? (si2 > 1 ? si2 * 100000 : 0) + ((si1 << 8) | si0) : (si2 << 16) | (si1 << 8) | si0);
/** The reverse: [SI2, SI1, SI0]. */
export function cardBytes(number) {
  if (number >= 500000) return [(number >> 16) & 0xFF, (number >> 8) & 0xFF, number & 0xFF];
  const series = Math.floor(number / 100000), low = number - series * 100000;
  return [series || 1, (low >> 8) & 0xFF, low & 0xFF];
}

// ---- times

const pad = (n) => String(n).padStart(2, "0");
const day = (y, m, d) => (y > 99 || !m || m > 12 || !d || d > 31 ? null : `20${pad(y)}-${pad(m)}-${pad(d)}`);

/** The 7 bytes of a station's clock for a Date's local wall time: YY MM DD, weekday and half day, seconds within 12 h, 1/256 s. */
export function timeBytes(date) {
  const s = (date.getHours() % 12) * 3600 + date.getMinutes() * 60 + date.getSeconds();
  return Uint8Array.from([date.getFullYear() % 100, date.getMonth() + 1, date.getDate(), (date.getDay() << 1) | (date.getHours() >= 12 ? 1 : 0),
    s >> 8, s & 0xFF, Math.floor(date.getMilliseconds() * 256 / 1000)]);
}
/** A GET_TIME or SET_TIME answer's data: `{ stationCode, date "YYYY-MM-DD", dow (0 = Sunday), t (s after midnight), at (a local Date) }`. */
export function parseTime(data) {
  const d = bytes(data);
  if (d.length < 8) return null;
  const secs = (d[6] << 8) | d[7], t = (d[5] & 1) * HALF_DAY + secs + (d.length > 8 ? Math.round(d[8] * 1000 / 256) / 1000 : 0);
  const date = day(d[2], d[3], d[4]);
  if (!date || secs >= HALF_DAY) return null;
  const whole = Math.floor(t);
  return { stationCode: (d[0] << 8) | d[1], date, dow: (d[5] >> 1) & 7, t,
    at: new Date(2000 + d[2], d[3] - 1, d[4], Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60, Math.round((t - whole) * 1000)) };
}

// ---- a station's answers

/**
 * A GET_SYS_VAL answer's data (CN1, CN0, the address, then the bytes from it) as what a station is. Fields whose bytes
 * the answer does not hold are undefined. `battery.used` is the station's consumption counter (mA·s in the memory) in
 * mAh, `battery.capacity` in mAh (the memory's unit is 16/225 mAh: 28 125 on a 2 000 mAh station), `battery.ratio` one
 * over the other — the source gives 0 for 0 % and the full scale for 100 %.
 */
export function parseSystem(data) {
  const d = bytes(data);
  if (d.length < 4) return null;
  const adr = d[2], n = d.length - 3;
  const has = (i, len = 1) => i >= adr && i + len <= adr + n;
  const at = (i) => d[3 + i - adr];
  const int = (i, len) => { if (!has(i, len)) return undefined; let v = 0; for (let k = 0; k < len; k++) v = v * 256 + at(i + k); return v; };
  const date = (i) => (has(i, 3) ? day(at(i), at(i + 1), at(i + 2)) : undefined);
  const out = { stationCode: (d[0] << 8) | d[1], serial: int(SYS.SERIAL, 4), build: date(SYS.BUILD), model: int(SYS.MODEL, 2), memory: int(SYS.MEMORY, 1) };
  if (has(SYS.FIRMWARE, 3)) out.firmware = String.fromCharCode(at(5), at(6), at(7)).replace(/[^\x20-\x7E]/g, "");
  if (out.model != null) out.modelName = MODEL_NAME[out.model] || "";
  if (has(SYS.SI6_MODE)) out.si6x192 = at(SYS.SI6_MODE) === 0x08 || at(SYS.SI6_MODE) === 0xFF;
  if (has(SYS.MODE)) { out.mode = at(SYS.MODE); out.modeName = MODE_NAME[out.mode] || ""; }
  if (has(SYS.CODE, 2)) { out.code = at(SYS.CODE) | ((at(SYS.SIGNALS) & 0xC0) << 2); out.flashes = !!(at(SYS.SIGNALS) & 1); out.beeps = !!(at(SYS.SIGNALS) & 4); }
  if (has(SYS.PROTOCOL)) {
    const f = at(SYS.PROTOCOL);
    Object.assign(out, { protocol: f, extended: !!(f & FLAG.EXTENDED), autosend: !!(f & FLAG.AUTOSEND), handshake: !!(f & FLAG.HANDSHAKE), autoReadout: !!(f & FLAG.AUTO_READOUT) });
  }
  if (has(SYS.BATTERY_CAP, 2)) {
    const raw = int(SYS.BATTERY_CAP, 2), used = int(SYS.BATTERY_USED, 4);
    out.battery = { date: date(SYS.BATTERY_DATE), capacity: Math.round(raw * 16 / 225) };
    if (used != null && raw) { out.battery.used = Math.round(used / 3600); out.battery.ratio = Math.min(1, Math.round(used / 3600 / (raw * 16 / 225) * 1000) / 1000); }
  }
  if (has(SYS.LAST_WRITE, 6)) {
    const secs = (at(0x79) << 8) | at(0x7A), w = day(at(0x75), at(0x76), at(0x77));
    if (w && secs < HALF_DAY) out.lastWrite = { date: w, t: (at(0x78) & 1) * HALF_DAY + secs };
  }
  return out;
}

/** A card put in (SI5_DET, SI6_DET, SI8_DET) or taken out (SI_REM): `{ stationCode, card, series? }`; null for anything else. */
export function parseCardEvent(m) {
  const d = m?.data;
  if (!d || d.length < 6 || ![CMD.SI5_DET, CMD.SI6_DET, CMD.SI8_DET, CMD.SI_REM].includes(m.cmd)) return null;
  const out = { stationCode: (d[0] << 8) | d[1], card: cardNumber(d[3], d[4], d[5]) };
  if (m.cmd === CMD.SI8_DET) out.series = d[2];
  return out;
}

/**
 * A punch a station sends by itself (TRANS_REC's data: CN1 CN0, SI3-SI0, TD, TH TL, TSS, MEM2-MEM0):
 * `{ code, card, t (s after midnight), dow (0 = Sunday), mem (its place in the station's backup) }`; null when it holds no time.
 */
export function parsePunch(data) {
  const d = bytes(data);
  if (d.length < 9) return null;
  const secs = (d[7] << 8) | d[8];
  if (secs >= HALF_DAY) return null;
  const out = { code: (d[0] << 8) | d[1], card: cardNumber(d[3], d[4], d[5]), t: (d[6] & 1) * HALF_DAY + secs + (d.length > 9 ? Math.round(d[9] * 100 / 256) / 100 : 0), dow: (d[6] >> 1) & 7 };
  if (d.length >= 13) out.mem = (d[10] << 16) | (d[11] << 8) | d[12];
  return out;
}
/** The reverse, for the simulator: `{ code, card, t, dow? }` as TRANS_REC's data. */
export function punchBytes({ code, card, t, dow = 0, mem = 0 }) {
  const whole = Math.floor(t), half = whole % HALF_DAY;
  return Uint8Array.from([code >> 8, code & 0xFF, 0, ...cardBytes(card), ((dow & 7) << 1) | (whole % 86400 >= HALF_DAY ? 1 : 0), half >> 8, half & 0xFF,
    Math.floor((t - whole) * 256), (mem >> 16) & 0xFF, (mem >> 8) & 0xFF, mem & 0xFF]);
}
