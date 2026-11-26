// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Where a station keeps its log: the browser's database (IndexedDB, written with strict durability so that a power cut
// loses nothing already shown), optionally a journal in a folder the user chose (one line an operation, readable by hand),
// and the event file `.chronoz` to carry a race from one computer to another. Browser only.

import { Log, newStation } from "./log.js";

const DB = "oz-chrono", VERSION = 1;
export const FILE_FORMAT = "chronoz", FILE_VERSION = 1;
let dbp = null;
const open = () => (dbp ||= new Promise((ok, ko) => {
  const r = indexedDB.open(DB, VERSION);
  r.onupgradeneeded = () => {
    const d = r.result;
    if (!d.objectStoreNames.contains("ops")) d.createObjectStore("ops", { keyPath: ["ev", "s", "n"] }).createIndex("ev", "ev");
    if (!d.objectStoreNames.contains("events")) d.createObjectStore("events", { keyPath: "ev" });
    if (!d.objectStoreNames.contains("kv")) d.createObjectStore("kv");
  };
  r.onsuccess = () => ok(r.result);
  r.onerror = () => { dbp = null; ko(r.error); };
}));
async function tx(stores, mode, fn) {
  const d = await open();
  return new Promise((ok, ko) => {
    let t;
    try { t = d.transaction(stores, mode, { durability: mode === "readwrite" ? "strict" : "default" }); } catch (e) { t = d.transaction(stores, mode); }
    let out;
    t.oncomplete = () => ok(out);
    t.onerror = t.onabort = () => ko(t.error);
    out = fn(t);
  });
}
const req = (r) => new Promise((ok, ko) => { r.onsuccess = () => ok(r.result); r.onerror = () => ko(r.error); });

/** The events this browser holds: `[{ ev, name, date, station, updated, ops }]`, the latest first. */
export async function listEvents() {
  const d = await open();
  const rows = await req(d.transaction("events").objectStore("events").getAll());
  return rows.sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
export async function loadOps(ev) {
  const d = await open();
  const rows = await req(d.transaction("ops").objectStore("ops").index("ev").getAll(IDBKeyRange.only(ev)));
  return rows.map(({ ev: _, ...o }) => o);
}
export const saveOps = (ev, ops) => tx(["ops"], "readwrite", (t) => { const s = t.objectStore("ops"); for (const o of ops) s.put({ ...o, ev }); });
export const saveMeta = (meta) => tx(["events"], "readwrite", (t) => { t.objectStore("events").put(meta); });
export async function dropEvent(ev) {
  await tx(["ops", "events"], "readwrite", (t) => {
    t.objectStore("events").delete(ev);
    const c = t.objectStore("ops").index("ev").openKeyCursor(IDBKeyRange.only(ev));
    c.onsuccess = () => { const cur = c.result; if (cur) { t.objectStore("ops").delete(cur.primaryKey); cur.continue(); } };
  });
}
export const kvGet = async (k) => { try { const d = await open(); return await req(d.transaction("kv").objectStore("kv").get(k)); } catch (e) { return undefined; } };
export const kvSet = (k, v) => tx(["kv"], "readwrite", (t) => { t.objectStore("kv").put(v, k); }).catch(() => {});

/**
 * An event's log, kept as it grows. Returns `{ log, meta, saved() (a promise of everything written), journal(dir), stop() }`.
 * The station's id is this browser's for this event: the same after a reload.
 */
export async function openEvent(ev, { name = "", date = "" } = {}) {
  const d = await open();
  let meta = await req(d.transaction("events").objectStore("events").get(ev));
  if (!meta) { meta = { ev, name, date, station: newStation(), created: Date.now(), updated: Date.now() }; await saveMeta(meta); }
  const log = new Log(meta.station, await loadOps(ev));
  let queue = [], writing = Promise.resolve(), jour = null, failed = null;
  const flush = () => {
    if (!queue.length) return writing;
    const batch = queue; queue = [];
    writing = writing.then(() => saveOps(ev, batch)).then(() => jour?.append(batch)).catch((e) => { failed = e; queue = batch.concat(queue); });
    return writing;
  };
  const off = log.on((added) => {
    queue.push(...added);
    flush();
    const e = log.state.event;
    if (e.name !== meta.name || e.date !== meta.date || Date.now() - meta.updated > 60000) { meta = { ...meta, name: e.name || meta.name, date: e.date || meta.date, updated: Date.now() }; saveMeta(meta).catch(() => {}); }
  });
  return {
    log, get meta() { return meta; }, get failed() { return failed; },
    saved: () => flush(),
    /** Also append every operation to `<event>.chronoz.jsonl` in a folder (a File System Access directory handle). */
    async journal(dir) { jour = dir ? await openJournal(dir, `${fileName(log.state.event, ev)}.jsonl`, log.ops) : null; return !!jour; },
    stop() { off(); return flush(); },
  };
}

const fileName = (event, ev) => `${String(event?.name || "chrono").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "chrono"}-${String(ev).slice(0, 8)}.chronoz`;
export const eventFileName = (log, ev) => fileName(log.state.event, ev);

async function openJournal(dir, name, ops) {
  const fh = await dir.getFileHandle(name, { create: true });
  const line = (o) => JSON.stringify(o) + "\n";
  let size = (await fh.getFile()).size;
  const write = async (text, at) => { const w = await fh.createWritable({ keepExistingData: true }); await w.write({ type: "write", position: at, data: text }); await w.close(); };
  if (!size && ops.length) { const text = ops.map(line).join(""); await write(text, 0); size = new Blob([text]).size; }
  return { async append(batch) { const text = batch.map(line).join(""); await write(text, size); size += new Blob([text]).size; } };
}

/** The event as a file: everything, to open on another computer. */
export function toFile(log, ev) {
  return JSON.stringify({ format: FILE_FORMAT, version: FILE_VERSION, ev, saved: new Date().toISOString(), event: log.state.event, ops: log.ops });
}
/** A `.chronoz` file or a journal (`.jsonl`) → `{ ev, ops, event }`; throws "format" or "version". */
export function fromFile(text) {
  const s = String(text).trim();
  if (s.startsWith("{\"s\"") || /^\{"[a-z]+":/.test(s) && !s.startsWith("{\"format\"")) {
    const ops = s.split("\n").map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter((o) => o && typeof o.s === "string");   // a journal cut mid-line keeps what is whole
    if (!ops.length) throw new Error("format");
    return { ev: null, ops, event: null };
  }
  let d;
  try { d = JSON.parse(s); } catch (e) { throw new Error("format"); }
  if (d?.format !== FILE_FORMAT || !Array.isArray(d.ops)) throw new Error("format");
  if (d.version > FILE_VERSION) throw new Error("version");
  return { ev: d.ev || null, ops: d.ops, event: d.event || null };
}
