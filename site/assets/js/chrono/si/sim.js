// A made-up SPORTident master station behind the transport interface, for the tests and the tool's rehearsal: it answers
// what reader.js asks (SET_MS, system data read and written, the clock, the beep), says a card is in, serves its blocks,
// takes the ACK, says the card is out; `punch` sends a punch as a control with « autosend » or a radio dongle does.
// Its frames are protocol.js's and its cards cards.js's `encodeCard`: nothing here is recorded from a real station.

import { CMD, ACK, NAK, SYS, FLAG, MODE, Decoder, encode, timeBytes, cardBytes, punchBytes } from "./protocol.js";
import { cardFamily, encodeCard, BLOCK } from "./cards.js";

const SERIES = { si9: 1, si8: 2, pcard: 4, tcard: 6, si10: 15, si11: 15, siac: 15 };

/**
 * `opts`: `baud` the station speaks (38400), `code`, `mode` (READOUT), `serial`, `extended`, `handshake`, `autosend`
 * (its protocol byte), `mute` (answers nothing: a device that only sends), `delay` (ms before each answer), `chunk`
 * (answers cut in pieces of that many bytes), `noise` (stray bytes before each frame), `nak` / `lose` (that many block
 * requests refused / left unanswered), `onRead(block)` (called at each block request).
 * Returns `{ transport, insert(spec), remove(), punch({ code, card, t }), info }` — `spec` as `encodeCard` takes it;
 * `info`: `{ baud, open, acks, beeps, reads, writes: [[address, bytes]], memory, card, clock() }`.
 */
export function simStation(opts = {}) {
  const o = { baud: 38400, code: 1, mode: MODE.READOUT, serial: 123456, extended: true, handshake: true, autosend: false, mute: false,
    delay: 0, chunk: 0, noise: false, nak: 0, lose: 0, onRead: null, ...opts };
  const mem = new Uint8Array(SYS.SIZE);
  mem.set([(o.serial >>> 24) & 0xFF, (o.serial >> 16) & 0xFF, (o.serial >> 8) & 0xFF, o.serial & 0xFF, 0xF7, 0x36, 0x35, 0x36, 0x12, 0x03, 0x09, 0x91, 0x98, 0x80]);
  mem.set([0x12, 0x03, 0x09, 0x00, 0x36, 0xEE], SYS.BATTERY_DATE);                    // a 1 000 mAh battery
  mem.set([0x00, 0x05, 0x7E, 0x40], SYS.BATTERY_USED);                                // 100 mAh used
  mem[SYS.SI6_MODE] = 0xC1;
  mem.set([0x30, o.mode, o.code & 0xFF, 0x05 | ((o.code >> 2) & 0xC0), (o.extended ? FLAG.EXTENDED : 0) | (o.autosend ? FLAG.AUTOSEND : 0) | (o.handshake ? FLAG.HANDSHAKE : 0)], SYS.PROGRAM);
  const cn = [o.code >> 8, o.code & 0xFF];
  let cb = null, open = false, baud = 0, card = null, shift = 0, tail = Promise.resolve();
  const dec = new Decoder({ from: "host" });
  const info = { acks: 0, beeps: 0, reads: 0, writes: [], memory: mem, get baud() { return baud; }, get open() { return open; }, get card() { return card?.spec || null; },
    clock: () => new Date(Date.now() + shift) };

  /** Bytes to the computer, in order, later, in pieces when asked. */
  function send(frame) {
    const b = o.noise ? Uint8Array.from([0x00, 0x7F, 0xFF, ...frame]) : frame, step = o.chunk > 0 ? o.chunk : b.length;
    for (let i = 0; i < b.length; i += step) {
      const piece = b.slice(i, i + step);
      tail = tail.then(() => new Promise((done) => {
        const go = () => { if (open && baud === o.baud && cb) { try { cb(piece); } catch (e) { /* the listener's */ } } done(); };
        if (o.delay > 0) setTimeout(go, o.delay); else queueMicrotask(go);
      }));
    }
  }
  const answer = (cmd, data) => send(encode(cmd, [...cn, ...data]));
  const flag = (f) => !!(mem[SYS.PROTOCOL] & f);

  function command(m) {
    if (m.bare) { if (m.cmd === ACK) { info.acks++; info.beeps++; } return; }
    if (m.legacy || o.mute) return;
    const d = m.data;
    switch (m.cmd) {
      case CMD.SET_MS: return answer(m.cmd, [d[0]]);
      case CMD.GET_SYS_VAL: return answer(m.cmd, [d[0], ...mem.slice(d[0], d[0] + d[1])]);
      case CMD.SET_SYS_VAL: mem.set(d.slice(1), d[0]); info.writes.push([d[0], [...d.slice(1)]]); return answer(m.cmd, [d[0]]);
      case CMD.GET_TIME: return answer(m.cmd, [...timeBytes(info.clock())]);
      case CMD.SET_TIME: {
        const s = ((d[4] << 8) | d[5]) + (d[3] & 1) * 43200;
        shift = new Date(2000 + d[0], d[1] - 1, d[2], Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60, Math.round(d[6] * 1000 / 256)).getTime() - Date.now();
        return answer(m.cmd, [...timeBytes(info.clock())]);
      }
      case CMD.SIGNAL: info.beeps += d[0]; return answer(m.cmd, [d[0]]);
      case CMD.GET_SI5: case CMD.GET_SI6: case CMD.GET_SI8: {
        const n = m.cmd === CMD.GET_SI5 ? 0 : d[0], kind = !card ? 0 : card.family === "si5" ? CMD.GET_SI5 : card.family === "si6" ? CMD.GET_SI6 : CMD.GET_SI8;
        info.reads++;
        try { o.onRead?.(n); } catch (e) { /* the test's */ }
        if (o.lose > 0) { o.lose--; return; }
        if (o.nak > 0 || !card || kind !== m.cmd || n > 7) { if (o.nak > 0) o.nak--; return send(encode(NAK)); }
        const block = card.blocks[n] || new Uint8Array(BLOCK).fill(0xEE);
        return answer(m.cmd, m.cmd === CMD.GET_SI5 ? [...block] : [n, ...block]);
      }
      default: return send(encode(NAK));
    }
  }

  const transport = {
    async open({ baud: b = 38400 } = {}) { open = true; baud = b; dec.reset(); },
    async write(data) {
      if (!open) throw new Error("closed");
      if (baud !== o.baud) return;                              // another speed: the station makes nothing of it
      for (const m of dec.push(data)) command(m);
    },
    onData(f) { cb = f; },
    async close() { open = false; },
  };
  const detect = (c) => [c.family === "si5" || c.family === "si6" ? 0 : SERIES[c.family] ?? 0, ...cardBytes(c.spec.card)];

  return {
    transport, info,
    /** A card put in the station: announced when the station is a readout with handshake, then served block by block. */
    insert(spec) {
      const family = spec.family || cardFamily(spec.card);
      card = { spec, family, blocks: family === "tcard" || family === "fcard" ? {} : encodeCard({ ...spec, family }) };
      if (mem[SYS.MODE] === MODE.READOUT && flag(FLAG.HANDSHAKE) && flag(FLAG.EXTENDED) && !o.mute) {
        answer(family === "si5" ? CMD.SI5_DET : family === "si6" ? CMD.SI6_DET : CMD.SI8_DET, detect(card));
      }
    },
    /** The card taken out. */
    remove() {
      if (!card) return;
      const c = card; card = null;
      if (mem[SYS.MODE] === MODE.READOUT && flag(FLAG.EXTENDED) && !o.mute) answer(CMD.SI_REM, detect(c));
    },
    /** A punch sent by itself: `{ code, card, t (s after midnight), dow? }`. */
    punch(p) { send(encode(CMD.TRANS_REC, punchBytes(p))); },
  };
}
