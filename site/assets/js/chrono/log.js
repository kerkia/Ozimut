// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Chrono's log of operations (docs/design.md): every station appends operations — an entry changed, a card read, a
// radio punch — and the state of the race is what folding them in order gives. The order is (t, s, n): a hybrid clock (wall
// milliseconds × 1000 + a counter, never going back), then the station, then its sequence number, so every station folds the
// same log into the same state. An operation that arrives out of order (a station back after a cut) replays the log.
// Nothing here knows about screens, files or networks.

export const COLS = ["controls", "courses", "classes", "clubs", "runners", "teams"];
export const emptyState = () => ({ event: {}, controls: {}, courses: {}, classes: {}, clubs: {}, runners: {}, teams: {}, reads: {}, radio: [], notes: [] });

export const cmp = (a, b) => a.t - b.t || (a.s < b.s ? -1 : a.s > b.s ? 1 : 0) || a.n - b.n;
export const opId = (o) => `${o.s}:${o.n}`;
export const opMs = (o) => Math.floor(o.t / 1000);

const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);
function putRow(st, c, id, p) {
  const col = COLS.includes(c) ? st[c] : null;
  if (!col || id == null || UNSAFE.has(String(id)) || (p !== null && typeof p !== "object")) return;      // never a name that would reach the objects' prototype
  if (p === null) { delete col[id]; return; }
  const row = col[id] || (col[id] = { id });
  for (const [k, v] of Object.entries(p)) { if (UNSAFE.has(k)) continue; if (v === null || v === undefined) delete row[k]; else row[k] = v; }
  if (c === "controls") row.code = Number(id);
}

/** One operation folded into the state. */
export function apply(st, o) {
  switch (o.k) {
    case "ev": for (const [k, v] of Object.entries(o.p || {})) { if (UNSAFE.has(k)) continue; if (v === null) delete st.event[k]; else st.event[k] = v; } break;
    case "put": putRow(st, o.c, o.id, o.p); break;
    case "many": if (Array.isArray(o.rows)) for (const r of o.rows) if (Array.isArray(r)) putRow(st, r[0], r[1], r[2]); break;
    case "read": if (o.r?.id && !UNSAFE.has(String(o.r.id)) && Array.isArray(o.r.punches) && !st.reads[o.r.id]) st.reads[o.r.id] = { ...o.r, st: o.s }; break;
    case "assign": if (st.reads[o.id]) st.reads[o.id].runner = o.runner; break;
    case "edit": if (st.reads[o.id]) { if (o.e) st.reads[o.id].ed = o.e; else delete st.reads[o.id].ed; } break;
    case "punch": if (o.p) st.radio.push({ ...o.p, id: opId(o) }); break;
    case "note": if (o.x) st.notes.push({ ...o.x, id: opId(o), at: opMs(o), by: o.by || "", st: o.s }); break;
    default: break;                                     // an operation of a newer version: kept in the log, not folded
  }
}

export class Log {
  /** `station`: this station's id; `ops`: what is already known (any order). */
  constructor(station, ops = [], now = () => Date.now()) {
    this.station = station;
    this.now = now;
    this.ops = [];
    this.ids = new Set();
    this.top = {};                 // station -> the highest n such that 1..n are all here
    this.loose = {};               // station -> Set of n beyond a gap
    this.clock = 0;
    this.rev = 0;                  // goes up with every change of state
    this.state = emptyState();
    this.subs = new Set();
    this.merge(ops, { silent: true });
  }

  /** What this log holds of each station: { station: n }. */
  have() { return { ...this.top }; }
  /** The operations another log lacks, given its `have()`. */
  since(have = {}) { return this.ops.filter((o) => o.n > (have[o.s] || 0)); }
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  emit(added, local) { this.rev++; for (const fn of this.subs) { try { fn(added, local); } catch (e) { /* a listener's fault is its own */ } } }

  note(o) {
    this.ids.add(opId(o));
    if (o.t > this.clock) this.clock = o.t;
    const top = this.top[o.s] || 0;
    if (o.n === top + 1) {
      let n = o.n;
      const loose = this.loose[o.s];
      while (loose?.has(n + 1)) { loose.delete(n + 1); n++; }
      this.top[o.s] = n;
    } else if (o.n > top) (this.loose[o.s] || (this.loose[o.s] = new Set())).add(o.n);
  }

  /** A new operation of this station: `add("put", { c: "runners", id, p }, "Camille")`. */
  add(k, fields = {}, by = "") {
    const t = Math.max(this.now() * 1000, this.clock + 1);
    const o = { s: this.station, n: (this.top[this.station] || 0) + 1, t, by, k, ...fields };
    this.note(o);
    this.ops.push(o);
    apply(this.state, o);
    this.emit([o], true);
    return o;
  }

  /** Operations from elsewhere (or from a file): those not held are taken; returns them. */
  merge(ops, { silent = false } = {}) {
    const fresh = [];
    for (const o of ops || []) {
      if (!o || typeof o.s !== "string" || !Number.isFinite(o.n) || !Number.isFinite(o.t) || this.ids.has(opId(o))) continue;
      fresh.push(o);
      this.note(o);
    }
    if (!fresh.length) return fresh;
    fresh.sort(cmp);
    const last = this.ops[this.ops.length - 1];
    if (!last || cmp(last, fresh[0]) < 0) {
      for (const o of fresh) { this.ops.push(o); apply(this.state, o); }
    } else {
      this.ops = this.ops.concat(fresh).sort(cmp);
      this.replay();
    }
    if (!silent) this.emit(fresh, false);
    return fresh;
  }

  replay() {
    const st = emptyState();
    for (const o of this.ops) apply(st, o);
    this.state = st;
  }
}

/** A station's id: short, random, readable. */
export function newStation() {
  const A = "abcdefghjkmnpqrstuvwxyz23456789", r = crypto.getRandomValues(new Uint8Array(6));
  return [...r].map((x) => A[x % A.length]).join("");
}
/** An event's code for linking the arena's computers (peers.mjs): six letters and digits that cannot be mistaken. */
export function newCode() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", r = crypto.getRandomValues(new Uint8Array(6));
  return [...r].map((x) => A[x % A.length]).join("");
}
export function newId() {
  const A = "abcdefghjkmnpqrstuvwxyz23456789", r = crypto.getRandomValues(new Uint8Array(9));
  return [...r].map((x) => A[x % A.length]).join("");
}
