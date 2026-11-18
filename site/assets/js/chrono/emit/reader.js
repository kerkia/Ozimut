// An Emit reading unit behind Chrono's reader interface (docs/chrono/design.md, « What a reader gives »): the « 250 »
// reader, which sends a card for as long as it lies on it and takes no command, the MTR4, which sends each card once
// with its own clock, keeps the last 2 040 and answers a few commands, and — as far as Emit has published it — the eScan
// and the eScan2: their status and an emiTag's passing, in the text messages of Emit's eClock+ manual. What an eScan
// sends for an e-card's content is in no public document: such a message is told (« unsupported »), never read.
// Facts and sources: docs/chrono/emit.md.
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
// `onPunch` — the text messages' units only (an eScan, an eScan2, an eClock+…), for an emiTag's passing:
//   { sys: "emit", card (the tag's number), code (the unit's), t and s (the passing on the unit's clock, s within the day,
//     to the millisecond; `s` is the name the log's « punch » takes), at, src: "escan", race (the tag's own time since its
//     start, s, or null), unit (the unit's serial number), msg (its running number), retries }
//   — once for a tag, code and time. A 250 and an MTR4 relay no punch.
// `onState({ sys, kind, state, … })`: "open", "ready" (a first good frame: `kind` is known), "card" (`card`), "idle" (the
// card left a 250), "status" (an MTR's: id, lowBattery, date, clock, skew — its clock less this computer's, s —, recent,
// oldest, sessions; a text unit's, when first heard or changed: id, name, version, hw, sw, serial, product, code, clock,
// skew, via, and `info` { model, serial, code, version }, what a station shows of a reader), "closed". `onError(e)`: an Error whose `code` is "open", "write", "checksum" (`part` "head" | "sum";
// the card is to be read again), "sync" (bytes that are no frame: noise, another device, another speed), "truncated"
// (a frame cut short), "unsupported" (a command asked of a 250 or an eScan; or, `part` "message", `b` its B item: a text
// message this code cannot read — an eScan's card content —, said once for each kind of message).

import { Decoder, serialOf, unitOfUsb, mtrCommand, stampOf } from "./protocol.js";

const KINDS = ["250", "mtr4", "escan", "auto"];
const problem = (code, more) => Object.assign(new Error(code), { code, ...more });

/**
 * The kind to ask for a port, from its USB ids (Web Serial's `port.getInfo()`): "escan" for the first eScan, whose ids
 * are its own; "auto" for anything else — an eScan2 sits behind the same FTDI chip as a 250 or an MTR4 and, at another
 * speed, has to be asked for by name ("escan").
 */
export const kindOfPort = (info) => (unitOfUsb(info) === "escan" ? "escan" : "auto");

/**
 * `transport`: `{ open(opts), write(bytes), onData(cb), close() }`. Options: the callbacks, `kind` ("250" | "mtr4" |
 * "escan": the text messages at 115 200 bit/s, nothing ever written to the unit | "auto": at 9 600 bit/s, listens for all
 * three and asks an MTR for its status), `now` (a clock, for tests), `gap` (ms without a frame after which a card has
 * left a 250: the same card then counts as put down again), `stale` (ms of silence after which half a frame is dropped).
 * Returns `{ info(), close() }` and, for "mtr4" and "auto", `{ status(), spool(from?), setTime(date?) }`.
 */
export function openReader(transport, { onCard, onPunch, onState, onError, kind = "auto", now = Date.now, gap = 2000, stale = 1000 } = {}) {
  if (!KINDS.includes(kind)) throw problem("kind");
  const dec = new Decoder({ kind }), serial = { ...serialOf(kind) }, seen = new Set(), told = new Set();
  const st = { open: false, closed: false, ready: false, kind: kind === "auto" ? null : kind, frames: 0, cards: 0, punches: 0, repeats: 0, errors: 0,
    unread: 0, last: null, mtr: null, unit: null };
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
  const skewOf = (clock, t) => { const d = new Date(t); return ((clock - (d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()) + 129600) % 86400) - 43200; };
  function unitStatus(it, t) {                                  // a text unit says what it is again and again: told when it changes
    const was = st.unit, same = was && was.id === it.id && was.serial === it.unit && was.code === it.code;
    st.unit = { id: it.id, name: it.name, version: it.version, hw: it.hw, sw: it.sw, serial: it.unit, product: it.product, code: it.code, clock: it.clock,
      skew: it.clock == null ? null : Math.round(skewOf(it.clock, t)), via: it.via, msg: it.msg, at: t };
    if (!same) state({ state: "status", ...st.unit, info: { model: it.product || it.name, serial: it.unit, code: it.code, version: it.version } });
  }
  function passing(it, t) {
    const key = `tag:${it.card}:${it.code}:${it.t}`;
    if (seen.has(key)) { st.repeats++; return; }               // a tag not acknowledged says it three times
    seen.add(key);
    st.punches++; st.last = { card: it.card, at: t };
    call(onPunch, { sys: "emit", card: it.card, code: it.code, t: it.t, s: it.t, at: t, src: "escan", race: it.race, unit: it.unit, msg: it.msg, retries: it.retries });
  }
  function text(it, t) {
    if (it.type === "status") return unitStatus(it, t);
    if (it.type === "tag") return passing(it, t);
    st.unread++;                                               // a card's content, a dump: Emit has published no layout for them
    if (told.has(it.b)) return undefined;
    told.add(it.b);
    return error("unsupported", { part: "message", b: it.b, items: it.items.length });
  }
  function take(it, t) {
    if (it.kind === "error") return error(it.code, it.part ? { part: it.part } : undefined);
    st.frames++;
    if (!st.ready) { st.ready = true; st.kind = it.kind === "mtr" ? "mtr4" : it.kind === "text" ? "escan" : "250"; state({ state: "ready" }); }
    if (it.kind === "card250") return card250(it, t);
    if (it.kind === "text") return text(it, t);
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
    return kind === "250" || kind === "escan" ? undefined : send(mtrCommand("status"));   // an MTR answers; a 250 takes no command, an eScan is sent none
  }, (cause) => error("open", { cause }));

  const mtrOnly = (fn) => (...a) => { if (st.kind === "250" || st.kind === "escan") { error("unsupported"); return Promise.resolve(false); } return fn(...a); };
  const handle = {
    /** What is known of the unit and the line. */
    info: () => ({ sys: "emit", kind: st.kind, asked: kind, model: st.kind === "escan" ? st.unit?.product || st.unit?.name || null : st.kind,
      serial: { ...serial }, open: st.open, ready: st.ready, frames: st.frames, cards: st.cards, punches: st.punches, repeats: st.repeats, errors: st.errors,
      unread: st.unread, pending: dec.pending, on: on ? on.card : null, last: st.last, mtr: st.mtr, unit: st.unit }),
    close() {
      if (st.closed) return Promise.resolve();
      st.closed = true; st.open = false;
      if (timer != null) { clearTimeout(timer); timer = null; }
      state({ state: "closed" });
      return opening.then(() => transport.close()).catch(() => {});
    },
  };
  if (kind === "mtr4" || kind === "auto") Object.assign(handle, {
    /** Ask the MTR for its status (comes as the "status" state). */
    status: mtrOnly(() => send(mtrCommand("status"))),
    /** Have the MTR send its memory again — all of it, or from package `from` on: the reads already given are not given twice. */
    spool: mtrOnly((from) => send(from == null ? mtrCommand("spoolAll") : mtrCommand("spoolFrom", from))),
    /** Set the MTR's clock to `date`'s local time (this computer's by default), then ask its status. */
    setTime: mtrOnly((date = new Date(now())) => send(mtrCommand("setClock", stampOf(date))).then((ok) => ok && send(mtrCommand("status")))),
  });
  return handle;
}
