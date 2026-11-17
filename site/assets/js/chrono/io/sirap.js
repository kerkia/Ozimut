// SIRAP: the punch packets radio relays (ROC, WiRoc, YAROC, jSh.radio…) send over TCP to the event software — MeOS listens
// for them on its « TCP » input (default port 10000) and so can Chrono. Written from the layout MeOS's reader expects and
// two senders build (docs/chrono/meos.md); no code of theirs. No framing, no checksum, no answer: 15 bytes a packet,
// little-endian —
//   0      type: 0 a punch; 64 a whole card when the next field is 2…192 and the time 0
//   1-2    the control's code (a card: the number of records that follow)
//   3-6    the card's number
//   7-10   « code day », obsolete: written 0, ignored
//   11-14  the time, tenths of a second after midnight (a card: 0)
// — and after a card's header, 8 bytes a record: the code (4 bytes; 1 start, 2 finish, 3 check, else a control) and its
// time (4 bytes, tenths after midnight). A stream that loses a byte cannot be put back in step: close the connection.

export const SIRAP_PORT = 10000;
const LEN = 15, REC = 8, PUNCH = 0, CARD = 64, MAX_RECORDS = 192, START = 1, FINISH = 2, CHECK = 3;
const tenths = (t) => Math.max(0, Math.round((Number(t) || 0) * 10)) >>> 0;

/** One punch as its 15 bytes: `t` in seconds after midnight (tenths kept). */
export function buildPunch({ code, card, t, type = PUNCH }) {
  const b = new Uint8Array(LEN), v = new DataView(b.buffer);
  b[0] = type & 255;
  v.setUint16(1, code & 0xffff, true);
  v.setUint32(3, card >>> 0, true);
  v.setUint32(11, tenths(t), true);
  return b;
}

/** A whole card: check, start, the punches ([code, t] or { code, t }) in order, finish — 2 to 192 records in all. */
export function buildCard({ card, start, finish, check, punches = [] }) {
  const recs = [check != null ? [CHECK, check] : null, start != null ? [START, start] : null,
    ...punches.map((p) => (Array.isArray(p) ? p : [p.code, p.t])), finish != null ? [FINISH, finish] : null].filter(Boolean);
  if (recs.length < 2 || recs.length > MAX_RECORDS) throw new RangeError(`a SIRAP card holds 2 to ${MAX_RECORDS} records, not ${recs.length}`);
  const b = new Uint8Array(LEN + REC * recs.length), v = new DataView(b.buffer);
  b[0] = CARD;
  v.setUint16(1, recs.length, true);
  v.setUint32(3, card >>> 0, true);
  recs.forEach(([code, t], i) => { v.setUint32(LEN + REC * i, code >>> 0, true); v.setUint32(LEN + REC * i + 4, tenths(t), true); });
  return b;
}

/** A connection's bytes as they come, in chunks of any size: `push(chunk)` gives the messages now complete. */
export class SirapDecoder {
  constructor() { this.rest = new Uint8Array(0); }
  /** Bytes waiting for the end of their packet. */
  get pending() { return this.rest.length; }
  reset() { this.rest = new Uint8Array(0); }
  push(chunk) {
    const c = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    const b = new Uint8Array(this.rest.length + c.length);
    b.set(this.rest);
    b.set(c, this.rest.length);
    const v = new DataView(b.buffer), out = [];
    let o = 0;
    while (b.length - o >= LEN) {
      const type = b[o], code = v.getUint16(o + 1, true), card = v.getUint32(o + 3, true), time = v.getUint32(o + 11, true);
      if (type === CARD && code > 1 && code <= MAX_RECORDS && time === 0) {
        if (b.length - o < LEN + REC * code) break;                       // its records are still on their way
        const m = { kind: "card", card, start: null, finish: null, check: null, punches: [] };
        for (let i = 0, at = o + LEN; i < code; i++, at += REC) {
          const k = v.getUint32(at, true), t = v.getUint32(at + 4, true) / 10;
          if (k === START) m.start = t; else if (k === FINISH) m.finish = t; else if (k === CHECK) m.check = t;
          else m.punches.push({ code: k, t });
        }
        out.push(m);
        o += LEN + REC * code;
      } else {
        out.push(type === PUNCH ? { kind: "punch", code, card, t: time / 10 } : { kind: "punch", code, card, t: time / 10, type });
        o += LEN;
      }
    }
    this.rest = b.subarray(o);
    return out;
  }
}

/** The messages of a buffer holding whole packets (what is left of a cut one is dropped). */
export const parseSirap = (bytes) => new SirapDecoder().push(bytes);
