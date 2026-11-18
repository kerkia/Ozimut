// A pretend Emit reading unit, for tests and demonstrations without hardware: a transport (`open`, `write`, `onData`,
// `close`) whose bytes are those a « 250 » reader or an MTR4 would send — built by protocol.js's encoders from the facts
// of docs/chrono/emit.md, so it is only as right as they are. Everything is delivered at once, in the caller's turn.
//
//   const sim = simReader({ kind: "250" });           // or "mtr4"
//   const reader = openReader(sim.transport, { kind: "250", onCard });
//   sim.insert({ card: 123456, punches: [{ code: 0, t: 0 }, { code: 31, t: 95 }, { code: 100, t: 410 }] });
//
// As a card does, `insert` adds the unit's own punch (its code, `lag` seconds after the card's last one) unless `spec.raw`.
// A 250 sends the frame `repeat` times (it repeats a card for as long as it lies there); an MTR sends it once, keeps it,
// and answers /ST, /SA, /SBxxxx, /GBxxxx, /NS, /SCymdhms and /CL.
//
// `kind: "escan"` is a unit of the text messages (an eScan, an eScan2, an eClock+): `status()` and `tag(spec)` send the two
// messages Emit's eClock+ manual prints, `text(items)` any other. It has no `insert`: what an eScan sends for a card's
// content is not published, and nothing is made up here. It listens to nothing.

import { encodeCard250, encodeMtrCard, encodeMtrStatus, encodeText, encodeTextStatus, encodeTextTag, readMtrCommand, stampOf, cardText } from "./protocol.js";

/**
 * Options: `kind` "250" | "mtr4" | "escan"; `code` the unit's code (250); `lag` (s); `repeat` (frames a card on a 250);
 * `chunk`: how the bytes arrive — a size, or `(bytes) => [chunks]` (whole messages by default); `id` (an MTR's serial
 * number); `now` (a clock); `lowBattery`; for "escan": `unit` (its serial number) and `name` (its I item) — the eClock+
 * manual's examples by default.
 * Returns `{ transport, insert(spec, how?), noise(bytes), opened, written, commands, stored }` — `how`: `{ repeat, tick
 * (s added to the unit's punch at each repeat), corrupt (which copy is damaged: a number, or "all"), cut (bytes of the
 * first copy that get through) }` — and, for "escan", `{ status(over?), tag(spec, how?), text(items) }`.
 */
export function simReader({ kind = "250", code = 250, lag = 5, repeat = 2, chunk = 0, id = 1, now = Date.now, lowBattery = false,
  unit = "126099999", name = "eClock-HW2-SW2-V1.02" } = {}) {
  const subs = [], pendingCmd = [];
  const sim = { opened: null, closed: false, written: [], commands: [], stored: [] };
  let recent = 0, sessions = [1], offset = 0;                 // an MTR's package counter, session starts, clock offset (ms)
  let msg = 0;                                                // a text unit's running message number

  const split = (bytes) => {
    if (typeof chunk === "function") return chunk(bytes);
    if (!chunk) return [bytes];
    const out = [];
    for (let i = 0; i < bytes.length; i += chunk) out.push(bytes.slice(i, i + chunk));
    return out;
  };
  const emit = (bytes) => { if (!sim.closed) for (const part of split(Uint8Array.from(bytes))) for (const cb of subs) cb(part); };
  const clock = () => stampOf(new Date(now() + offset));
  const damaged = (bytes) => { const b = Uint8Array.from(bytes); b[Math.floor(b.length / 2)] ^= 0x55; return b; };

  function content(spec, extra = 0) {
    const punches = (spec.punches || []).map((p) => ({ code: p.code, t: p.t }));
    if (!spec.raw) punches.push({ code, t: Math.min(65534, (punches.length ? punches[punches.length - 1].t : 0) + (spec.lag ?? lag) + extra) });
    return { card: spec.card, week: spec.week ?? 20, year: spec.year ?? 24, punches,
      ...(spec.ascii ? { ascii: spec.ascii } : { text: spec.text ?? cardText({ name: "Emit EPT V6.00", disp: "", p: 1, l: 1 }) }) };
  }
  const status = () => encodeMtrStatus({ id, stamp: clock(), lowBattery, recent, oldest: sim.stored.length ? sim.stored[0].pack : 1,
    sessions: sessions.slice(0, 8) });

  function command(c) {
    sim.commands.push(c);
    if (c.name === "status") emit(status());
    else if (c.name === "spoolAll") sim.stored.forEach((m) => emit(m.bytes));
    else if (c.name === "spoolFrom") sim.stored.filter((m) => m.pack >= c.arg).forEach((m) => emit(m.bytes));
    else if (c.name === "getOne") sim.stored.filter((m) => m.pack === c.arg).forEach((m) => emit(m.bytes));
    else if (c.name === "newSession") sessions.unshift(recent + 1);
    else if (c.name === "setClock") offset = new Date(c.arg.y, c.arg.mo - 1, c.arg.d, c.arg.h, c.arg.mi, c.arg.s).getTime() - now();
    else if (c.name === "clear") { sim.stored.length = 0; recent = 0; sessions = [1]; }
  }

  sim.transport = {
    open(opts) { sim.opened = { ...opts }; sim.closed = false; return Promise.resolve(); },
    onData(cb) { subs.push(cb); },
    close() { sim.closed = true; return Promise.resolve(); },
    write(bytes) {
      sim.written.push(Uint8Array.from(bytes));
      if (kind !== "mtr4") return Promise.resolve();             // a 250 listens to nothing
      pendingCmd.push(...bytes);
      for (;;) {
        const at = pendingCmd.indexOf(0x2f);
        if (at < 0) { pendingCmd.length = 0; break; }
        pendingCmd.splice(0, at);
        const c = readMtrCommand(pendingCmd);
        if (c === undefined) break;                               // the rest is still to come
        pendingCmd.splice(0, c ? c.size : 1);
        if (c) command(c);
      }
      return Promise.resolve();
    },
  };

  /** A card is put on the unit: `{ card, punches: [{ code, t }], week?, year?, text? | ascii?, raw?, lag? }`. Returns the bytes sent. */
  sim.insert = (spec, how = {}) => {
    const sent = [];
    const out = (bytes, k) => {
      let b = how.corrupt === "all" || how.corrupt === k ? damaged(bytes) : bytes;
      if (how.cut != null && k === 0) b = b.slice(0, how.cut);
      sent.push(b); emit(b);
    };
    if (kind === "escan") throw Object.assign(new Error("unpublished"), { code: "unpublished" });   // a card's content on an eScan: no public layout
    if (kind === "mtr4") {
      const pack = ++recent, bytes = encodeMtrCard({ id, stamp: spec.stamp ?? clock(), pack, ...content(spec) });
      sim.stored.push({ pack, bytes });
      out(bytes, 0);
    } else {
      const n = how.repeat ?? repeat;
      for (let k = 0; k < n; k++) out(encodeCard250(content(spec, k * (how.tick ?? 0))), k);
    }
    return sent;
  };
  if (kind === "escan") {
    const dayClock = () => { const c = clock(); return c.h * 3600 + c.mi * 60 + c.s; };
    /** The unit says its status; `over`: fields of `encodeTextStatus` to change. Returns the bytes sent. */
    sim.status = (over = {}) => { const b = encodeTextStatus({ id: name, clock: dayClock(), msg, code, unit, ...over }); emit(b); return b; };
    /** An emiTag passes: `{ card, t? (s within the day: the unit's clock by default), race?, retries? }`; `how.repeat` copies (a tag not acknowledged). */
    sim.tag = (spec, how = {}) => {
      const b = encodeTextTag({ unit, code, t: dayClock(), ...spec, msg: ++msg });
      for (let k = 0; k < (how.repeat ?? 1); k++) emit(b);
      return b;
    };
    /** Any text message, by its items `[[key, value]…]` — one the reader cannot read, for instance. Returns the bytes sent. */
    sim.text = (items) => { const b = encodeText(items); emit(b); return b; };
  }
  /** Bytes that are no frame (a bad contact, another device). */
  sim.noise = (bytes) => emit(bytes);
  return sim;
}
