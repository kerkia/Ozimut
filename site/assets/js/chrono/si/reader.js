// A SPORTident station on a transport (`{ open({ baud }), write(bytes), onData(cb), close() }`: Web Serial in a page, the
// simulator in tests): the cards put in a readout station are read and given to `onCard`, the punches a station sends by
// itself — a control with « autosend », a radio (SRR) dongle seen as a serial port — to `onPunch`.
//
// What it does to a station, after GecoSI's and sportident.js's readout flows (MIT, see assets/chrono/LICENSE-sportident.txt):
//  - opens at 38400 baud, then 4800, sending « SET_MS direct » (talk to the station on the cable, not to one coupled on
//    top of it): a setting of the conversation, nothing is stored. A device answering at neither speed is listened to
//    at the first one (state "listening"): a radio dongle only sends;
//  - reads the system data (serial, mode, code, protocol byte);
//  - a station in READOUT mode must speak the extended protocol with handshake and without autosend, or it never says a
//    card is in. When its protocol byte (0x74) says otherwise, that one byte is written — as sportident.js's `readCards`
//    does — and the former value is written back by `close()`. A page closed without `close()` leaves the station in
//    extended protocol + handshake, the setting every readout software wants. `configure: false` never writes and reports
//    `{ code: "protocol" }` instead. The station's mode, code and signals are never touched, and a station in any other
//    mode is only listened to;
//  - a card put in: block 0, then the blocks its punch count needs (cards.js), each asked up to `tries` times; then the
//    read goes to `onCard` and, once that returned, the lone ACK that makes the station beep. A card taken out before
//    the end is `onError({ code: "removed" })`. No ACK when `onCard` throws: no beep, the runner puts the card in again.
//
// Errors are `{ code, message, card? }`: "open", "timeout", "nak", "removed", "unsupported" (tCard, fCard), "decode",
// "protocol", "legacy" (a station sending legacy frames: its extended protocol is off), "callback", "write", "closed".
// States (`onState({ state, info })`): "opening", "ready", "listening", "card", "reading", "removed", "closed".

import { CMD, LEGACY, ACK, NAK, MS_DIRECT, SYS, FLAG, MODE, Decoder, encode, parseSystem, parseTime, parseCardEvent, parsePunch, timeBytes } from "./protocol.js";
import { cardFamily, blocksOf, decodeCard, BLOCK } from "./cards.js";

const err = (code, more) => ({ code, message: code, ...more });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Resolves once the station answered (or is listened to) with `{ info(), getTime(), setTime(date), close() }`;
 * rejects with `{ code: "open" }` when the port cannot be opened. Options beside the callbacks: `bauds` [38400, 4800],
 * `probe` (ms a speed is given to answer), `timeout` (ms per try of a command), `tries`, `configure` (see above).
 */
export async function openReader(transport, options = {}) {
  const o = { bauds: [38400, 4800], probe: 1200, timeout: 2500, tries: 3, nakWait: 300, configure: true, ...options };
  const dec = new Decoder();
  let sys = null, baud = 0, state = "", closed = false, listening = false;
  let wait = null;            // the answer awaited: { cmd, match, resolve, reject, job }
  let chain = Promise.resolve();   // one command at a time
  let job = null;             // the card being read: { card, family, gone }
  let acked = 0;              // the card acknowledged and still in the station
  let saved = null;           // the protocol byte as it was before this session changed it
  let legacyTold = false;

  /** A callback, never throwing; a promise it returns is given back. */
  const call = (name, arg) => { try { return o[name]?.(arg); } catch (e) { return Promise.reject(e); } };
  const tell = (name, arg) => { Promise.resolve(call(name, arg)).catch(() => {}); };
  const setState = (s, more) => { state = s; tell("onState", { state: s, info: info(), ...more }); };
  const info = () => (sys ? { ...sys, baud } : listening ? { baud, listening: true } : null);

  // ---- bytes in
  transport.onData((chunk) => {
    if (closed) return;
    let list;
    try { list = dec.push(chunk); } catch (e) { dec.reset(); return; }
    for (const m of list) { try { handle(m); } catch (e) { tell("onError", err("error", { detail: String(e?.message || e) })); } }
  });
  function handle(m) {
    if (m.bare) { if (m.cmd === NAK && wait) settle(null, err("nak")); return; }
    if (wait && !m.legacy && m.cmd === wait.cmd && (!wait.match || wait.match(m))) return settle(m);
    if (m.legacy) {
      if ([LEGACY.TRANS_REC, LEGACY.SI5_DET, LEGACY.SI6_DET].includes(m.cmd) && !legacyTold) { legacyTold = true; tell("onError", err("legacy")); }
      return;
    }
    if (m.cmd === CMD.TRANS_REC) { const p = parsePunch(m.data); if (p) tell("onPunch", { ...p, at: Date.now() }); return; }
    if (m.cmd === CMD.SI_REM) return removed(parseCardEvent(m));
    if (m.cmd === CMD.SI5_DET || m.cmd === CMD.SI6_DET || m.cmd === CMD.SI8_DET) return inserted(m);
  }
  function settle(m, e) {
    const w = wait; wait = null;
    clearTimeout(w.timer);
    if (e) w.reject(e); else w.resolve(m);
  }

  // ---- commands out
  async function write(b) {
    try { await transport.write(b); } catch (e) { throw err(closed ? "closed" : "write", { detail: String(e?.message || e) }); }
  }
  /** One command and its answer, tried again after a NAK or a silence; `of` ties it to a card's read, which ends it when the card goes. */
  function command(cmd, data = [], { timeout = o.timeout, tries = o.tries, match = null, of = null } = {}) {
    const run = async () => {
      let last = err("timeout");
      for (let i = 0; i < tries; i++) {
        if (closed) throw err("closed");
        if (of?.gone) throw err(of.gone);
        const answer = new Promise((resolve, reject) => { wait = { cmd, match, resolve, reject, job: of }; wait.timer = setTimeout(() => wait && settle(null, err("timeout")), timeout); });
        answer.catch(() => {});
        try { await write(encode(cmd, data, { wake: true })); return await answer; }
        catch (e) {
          if (wait) settle(null, e);
          last = e;
          if (e.code !== "nak" && e.code !== "timeout") throw e;
          if (e.code === "nak" && i + 1 < tries) await sleep(o.nakWait);
        }
      }
      throw last;
    };
    const p = chain.then(run, run);
    chain = p.catch(() => {});
    return p;
  }

  // ---- cards
  function inserted(m) {
    const ev = parseCardEvent(m);
    if (!ev) return;
    if (acked && acked === ev.card) { write(encode(ACK)).catch(() => {}); return; }     // announced again while still in: beep again, no second read
    if (job) { if (job.card === ev.card) return; drop("removed"); }
    const family = m.cmd === CMD.SI5_DET ? "si5" : m.cmd === CMD.SI6_DET ? "si6" : cardFamily(ev.card, ev.series);
    acked = 0;
    if (!family || !blocksOf(family).length) { tell("onError", err("unsupported", { card: ev.card, family: family || "" })); return; }
    const mine = job = { card: ev.card, family, gone: "" };
    setState("card", { card: ev.card });
    readCard(mine).catch(() => {});
  }
  function removed(ev) {
    const reading = !!job;
    acked = 0;
    if (reading) drop("removed");                              // its read ends with the error, then says "ready"
    if (closed) return;
    setState("removed", ev ? { card: ev.card } : null);
    if (!reading) setState(listening ? "listening" : "ready");
  }
  /** The card being read is gone: its pending command ends at once. */
  function drop(why) {
    const j = job; job = null;
    j.gone = why;
    if (wait && wait.job === j) settle(null, err(why));
  }
  async function readCard(j) {
    const { family } = j, blocks = {};
    const cmd = family === "si5" ? CMD.GET_SI5 : family === "si6" ? CMD.GET_SI6 : CMD.GET_SI8, head = family === "si5" ? 2 : 3;
    const get = async (n) => {
      const m = await command(cmd, family === "si5" ? [] : [n], { of: j, match: (r) => r.data.length >= head + BLOCK && (family === "si5" || r.data[2] === n) });
      blocks[n] = m.data.slice(head, head + BLOCK);
    };
    try {
      setState("reading", { card: j.card });
      await get(0);
      for (const n of blocksOf(family, blocks[0])) await get(n);
      if (j.gone) throw err(j.gone);
      const read = decodeCard(family, blocks);
      if (!read) throw err(family === "tcard" || family === "fcard" ? "unsupported" : "decode");
      read.at = Date.now();
      try { await call("onCard", read); } catch (e) { throw err("callback", { detail: String(e?.message || e) }); }
      if (!j.gone && !closed) { await write(encode(ACK)); acked = j.card; }
    } catch (e) {
      tell("onError", err(e?.code || "error", { card: j.card, family, ...(e?.detail ? { detail: e.detail } : null) }));
    } finally {
      if (job === j) job = null;
      if (!closed && !job) setState(listening ? "listening" : "ready");
    }
  }

  // ---- the station
  async function start() {
    setState("opening");
    let answered = false;
    for (const b of o.bauds) {
      try { await transport.open({ baud: b }); } catch (e) { throw err("open", { detail: String(e?.message || e) }); }
      baud = b; dec.reset();
      try { await command(CMD.SET_MS, [MS_DIRECT], { timeout: o.probe, tries: 1, match: (r) => r.data[2] === MS_DIRECT }); answered = true; break; }
      catch (e) { if (closed) throw err("closed"); try { await transport.close(); } catch (x) { /* reopened below */ } }
    }
    if (!answered) {                                           // nothing answers: a device that only sends is still worth hearing
      baud = o.bauds[0];
      try { await transport.open({ baud }); } catch (e) { throw err("open", { detail: String(e?.message || e) }); }
      dec.reset(); listening = true;
      setState("listening");
      return;
    }
    await readSystem();
    const f = sys?.protocol, want = f == null ? null : (f | FLAG.EXTENDED | FLAG.HANDSHAKE) & ~FLAG.AUTOSEND;
    if (sys?.mode === MODE.READOUT && want !== f) {
      if (o.configure) {
        try { await command(CMD.SET_SYS_VAL, [SYS.PROTOCOL, want], { match: (r) => r.data[2] === SYS.PROTOCOL }); saved = f; await readSystem(); }
        catch (e) { tell("onError", err("protocol")); }
      } else tell("onError", err("protocol"));
    }
    setState("ready");
  }
  async function readSystem() {
    try { sys = parseSystem((await command(CMD.GET_SYS_VAL, [0, SYS.SIZE], { match: (r) => r.data[2] === 0 })).data); }
    catch (e) { if (!sys) sys = { stationCode: 0 }; tell("onError", err(e?.code || "timeout")); }
  }

  const handle_ = {
    /** What the station is (protocol.js `parseSystem`, plus `baud`); `{ baud, listening }` for a device that only sends; null before. */
    info,
    /** The station's clock: `{ date, dow, t, at }`. */
    getTime: async () => parseTime((await command(CMD.GET_TIME, [])).data),
    /** The station's clock set to `date`'s local time; resolves to the clock it then gives. */
    setTime: async (date = new Date()) => parseTime((await command(CMD.SET_TIME, timeBytes(date))).data),
    /** The protocol byte put back if this session changed it, then the port closed. */
    close: async () => {
      if (closed) return;
      if (job) drop("closed");
      if (saved != null) { try { await command(CMD.SET_SYS_VAL, [SYS.PROTOCOL, saved], { tries: 1, timeout: 800 }); } catch (e) { /* the station is gone */ } saved = null; }
      closed = true;
      if (wait) settle(null, err("closed"));
      try { await transport.close(); } catch (e) { /* already closed */ }
      setState("closed");
    },
  };
  transport.onClose?.(() => { if (!closed) { closed = true; if (wait) settle(null, err("closed")); tell("onError", err("closed")); setState("closed"); } });
  await start();
  return handle_;
}
