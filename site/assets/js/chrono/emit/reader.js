// An Emit reading unit behind Chrono's reader interface (docs/chrono/design.md, « What a reader gives »): the « 250 »
// reader, which sends a card for as long as it lies on it and takes no command, and the MTR4, which sends each card once
// with its own clock, keeps the last 2 040 and answers a few commands. Facts and sources: docs/chrono/emit.md.
//
// What `onCard` gets — nothing is judged, nothing interpreted:
//   { sys: "emit", card, family: "emit", start: null, finish: null, check: null, clear: null, rel: true,
//     punches: [{ code, t }],   every place of the card in use, in its order, raw codes: 0 = the start unit (the card's zero),
//                               99 = a control's low-battery mark, 250-253 = reading units (this one's punch is normally the
//                               last), anything else a control; t = seconds on the card's own clock (0-65535)
//     at,                       this computer's clock (epoch ms) when the frame came
//     src: "250" | "mtr4", week, year (the card's production), text, counters ({ s, p, l } | null),
//     readAt, readDate, mtr: { id, pack } }   MTR4 only: the unit's clock when it read the card (s within the day), its
//                               day « YYYY-MM-DD », its serial number and the message's package number
// `protocol.raceSpan(punches)` applies Emit's rule for where the race lies; the engine decides.
// `onPunch` is never called: neither unit relays punches (that is the ECU / emiTag side, not written).
// `onState({ sys, kind, state, … })`: "open", "ready" (a first good frame: `kind` is known), "card" (`card`), "idle" (the
// card left a 250), "status" (an MTR's: id, lowBattery, date, clock, skew — its clock less this computer's, s —, recent,
// oldest, sessions), "closed". `onError(e)`: an Error whose `code` is "open", "write", "checksum" (`part` "head" | "sum";
// the card is to be read again), "sync" (bytes that are no frame: noise, another device, another speed), "truncated"
// (a frame cut short), "unsupported" (a command asked of a 250).

import { Decoder, SERIAL, mtrCommand, stampOf } from "./protocol.js";

const KINDS = ["250", "mtr4", "auto"];
const problem = (code, more) => Object.assign(new Error(code), { code, ...more });

/**
 * `transport`: `{ open(opts), write(bytes), onData(cb), close() }`. Options: the callbacks, `kind` ("250" | "mtr4" |
 * "auto": listens for both and asks an MTR for its status), `now` (a clock, for tests), `gap` (ms without a frame after
 * which a card has left a 250: the same card then counts as put down again), `stale` (ms of silence after which half a
 * frame is dropped). Returns `{ info(), close() }` and, unless `kind` is "250", `{ status(), spool(from?), setTime(date?) }`.
 */
export function openReader(transport, { onCard, onPunch, onState, onError, kind = "auto", now = Date.now, gap = 2000, stale = 1000 } = {}) {
  if (!KINDS.includes(kind)) throw problem("kind");
  void onPunch;
  const dec = new Decoder({ kind }), serial = { ...SERIAL[kind] }, seen = new Set();
  const st = { open: false, closed: false, ready: false, kind: kind === "auto" ? null : kind, frames: 0, cards: 0, repeats: 0, errors: 0, last: null, mtr: null };
  let on = null, timer = null, lastData = 0;                 // `on`: the card lying on a 250 { card, seen }

  const call = (fn, x) => { if (fn) { try { fn(x); } catch (e) { /* a listener's fault is its own */ } } };
  const state = (x) => call(onState, { sys: "emit", kind: st.kind, ...x });
  const error = (code, more) => { st.errors++; call(onError, problem(code, more)); };
  const send = (bytes) => Promise.resolve().then(() => transport.write(bytes)).then(() => true, (cause) => { error("write", { cause }); return false; });

  function give(read) {
    st.cards++; st.last = { card: read.card, at: read.at };
    call(onCard, read);
    state({ state: "card", card: read.card });
  }
  const readOf = (it, at, src) => ({ sys: "emit", card: it.card, family: "emit", start: null, finish: null, check: null, clear: null,
    punches: it.punches.map((p) => ({ code: p.code, t: p.t })), rel: true, at, src, week: it.week, year: it.year, text: it.text, counters: it.counters });

  function watch() {                                          // says when the card has left a 250: its frames stop
    if (timer != null || st.closed) return;
    timer = setTimeout(() => {
      timer = null;
      if (!on || st.closed) return;
      if (now() - on.seen > gap) { on = null; state({ state: "idle" }); } else watch();
    }, gap + 50);
    timer?.unref?.();
  }
  function card250(it, t) {
    if (on && on.card === it.card && t - on.seen <= gap) { on.seen = t; st.repeats++; return; }   // still lying there (its last time moves on)
    on = { card: it.card, seen: t };
    give(readOf(it, t, "250"));
    watch();
  }
  function mtrCard(it, t) {
    const key = `${it.pack}:${it.card}:${it.date}:${it.readAt}`;
    if (seen.has(key)) { st.repeats++; return; }               // spooled again
    seen.add(key);
    if (!it.card && !it.punches.length) return;                // an empty record of its memory
    if (!it.headOk) return error("checksum", { part: "head", card: it.card, pack: it.pack });
    give({ ...readOf(it, t, "mtr4"), readAt: it.readAt, readDate: it.date, mtr: { id: it.id, pack: it.pack } });
  }
  function status(it, t) {
    const d = new Date(t), local = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
    st.mtr = { id: it.id, lowBattery: it.lowBattery, date: it.date, clock: it.clock, skew: ((it.clock - local + 129600) % 86400) - 43200,
      recent: it.recent, oldest: it.oldest, sessions: it.sessions, at: t };
    state({ state: "status", ...st.mtr });
  }
  function take(it, t) {
    if (it.kind === "error") return error(it.code, it.part ? { part: it.part } : undefined);
    st.frames++;
    if (!st.ready) { st.ready = true; st.kind = it.kind === "mtr" ? "mtr4" : "250"; state({ state: "ready" }); }
    if (it.kind === "card250") return card250(it, t);
    return it.type === "status" ? status(it, t) : mtrCard(it, t);
  }
  function feed(bytes) {
    if (st.closed || !bytes || !bytes.length) return;
    const t = now();
    if (dec.pending && t - lastData > stale) { dec.reset(); error("truncated"); }
    lastData = t;
    for (const it of dec.push(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))) take(it, t);
  }

  transport.onData(feed);
  const opening = Promise.resolve().then(() => transport.open(serial)).then(() => {
    if (st.closed) return undefined;
    st.open = true; state({ state: "open" });
    return kind === "250" ? undefined : send(mtrCommand("status"));   // an MTR answers; a 250 takes no command
  }, (cause) => error("open", { cause }));

  const mtrOnly = (fn) => (...a) => { if (st.kind === "250") { error("unsupported"); return Promise.resolve(false); } return fn(...a); };
  const handle = {
    /** What is known of the unit and the line. */
    info: () => ({ sys: "emit", kind: st.kind, asked: kind, serial: { ...serial }, open: st.open, ready: st.ready, frames: st.frames, cards: st.cards,
      repeats: st.repeats, errors: st.errors, pending: dec.pending, on: on ? on.card : null, last: st.last, mtr: st.mtr }),
    close() {
      if (st.closed) return Promise.resolve();
      st.closed = true; st.open = false;
      if (timer != null) { clearTimeout(timer); timer = null; }
      state({ state: "closed" });
      return opening.then(() => transport.close()).catch(() => {});
    },
  };
  if (kind !== "250") Object.assign(handle, {
    /** Ask the MTR for its status (comes as the "status" state). */
    status: mtrOnly(() => send(mtrCommand("status"))),
    /** Have the MTR send its memory again — all of it, or from package `from` on: the reads already given are not given twice. */
    spool: mtrOnly((from) => send(from == null ? mtrCommand("spoolAll") : mtrCommand("spoolFrom", from))),
    /** Set the MTR's clock to `date`'s local time (this computer's by default), then ask its status. */
    setTime: mtrOnly((date = new Date(now())) => send(mtrCommand("setClock", stampOf(date))).then((ok) => ok && send(mtrCommand("status")))),
  });
  return handle;
}
