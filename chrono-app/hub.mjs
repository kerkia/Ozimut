// Ozimut Chrono's hub (docs/chrono/design.md, « The app and its hub »). The app's main process runs it, and it runs alone
// under Node (tools/chrono/t_hub.mjs): nothing of Electron here, and no framework. It serves the standalone page and the
// site's assets over HTTP, holds one log per event and is a station like any other: every socket on /hub is tied to its
// event's log with sync.link, so what one station adds reaches the others through it. Every new operation is appended to
// the event's journal in the data folder — one JSON a line, written through to the disk, the file never rewritten — and
// read back when the event is opened again. A TCP listener takes the radio relays' SIRAP packets.
//
// Who may ask: a request from this computer (127.0.0.1, ::1) is trusted when it names the hub by a loopback address and
// comes from no other site than the hub's own page, ozimut.com or a local page — any website can make a browser call
// 127.0.0.1. Every other request gives the token: `?k=`, the header X-Hub-Token, or the cookie the hub sets once `?k=` was
// right (a page opened from another computer loads its assets with it).

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { WebSocketServer } from "ws";
import { Log } from "../site/assets/js/chrono/log.js";
import { link } from "../site/assets/js/chrono/sync.js";
import { takeRead } from "../site/assets/js/chrono/model.js";
import { SirapDecoder } from "../site/assets/js/chrono/io/sirap.js";

export const EVENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const JOURNAL = /^([A-Za-z0-9_-]{1,64})\.ozchrono\.jsonl$/;
const DEVICE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;          // Windows' devices, whatever follows the dot: never a file
const LOOPBACK = /^(::ffff:)?127\.\d+\.\d+\.\d+$|^::1$/;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const TEXT = "; charset=utf-8";
const MIME = {
  ".html": "text/html" + TEXT, ".js": "text/javascript" + TEXT, ".mjs": "text/javascript" + TEXT, ".css": "text/css" + TEXT,
  ".json": "application/json" + TEXT, ".webmanifest": "application/manifest+json" + TEXT, ".txt": "text/plain" + TEXT,
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".ico": "image/x-icon", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  ".wasm": "application/wasm", ".pdf": "application/pdf",
};
// what a visitor from another computer gets without the token: a field for it (no words: the page has no language yet)
const ASK = "<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Ozimut Chrono</title>"
  + "<form style=\"display:flex;gap:8px;justify-content:center;margin:25vh 16px 0;font:18px system-ui,sans-serif\">"
  + "<input name=\"k\" autofocus autocomplete=\"off\" placeholder=\"&#128273;\" aria-label=\"&#128273;\" style=\"font:inherit;padding:8px;min-width:0;width:16em\">"
  + "<button style=\"font:inherit;padding:8px 16px\">OK</button></form>";

// What a station sends is looked at before the log takes it: an operation the log could not fold, or whose ids would write
// into every object (« __proto__ », « constructor »), is left out.
const isObj = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const key = (x) => (typeof x === "string" || typeof x === "number") && !(String(x) in Object.prototype);
const patch = (p) => p === null || (isObj(p) && Object.keys(p).every(key));
function sane(o) {
  if (!isObj(o) || typeof o.s !== "string" || !o.s || typeof o.k !== "string") return false;
  if (!Number.isSafeInteger(o.n) || o.n < 1 || !Number.isFinite(o.t) || o.t <= 0 || o.t > Number.MAX_SAFE_INTEGER) return false;
  if (o.id !== undefined && !key(o.id)) return false;
  switch (o.k) {
    case "ev": return o.p === undefined || patch(o.p);
    case "put": return key(o.c) && key(o.id) && patch(o.p);
    case "many": return o.rows == null || (Array.isArray(o.rows) && o.rows.every((r) => Array.isArray(r) && key(r[0]) && key(r[1]) && patch(r[2])));
    case "read": return o.r == null || (isObj(o.r) && (o.r.id === undefined || key(o.r.id)));
    case "punch": return o.p == null || isObj(o.p);
    case "note": return o.x == null || isObj(o.x);
    default: return true;                                 // an operation of a newer version: kept and passed on
  }
}
/** The operations of a list that a log can take. */
export const saneOps = (ops) => (Array.isArray(ops) ? ops.filter(sane) : []);

/** A journal's operations; `cut`: its last line has no end (a power failure while writing it). */
function readJournal(file) {
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { if (e.code !== "ENOENT") throw e; }
  const ops = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try { ops.push(JSON.parse(line)); } catch (e) { /* a line cut short: what is whole is kept */ }
  }
  return { ops: saneOps(ops), cut: text !== "" && !text.endsWith("\n") };
}

/**
 * Starts the hub; resolves once it listens. `folder`: where the journals go; `assets`: the site's assets; `www`: the folder
 * of the standalone page; `token`: asked of other computers (a random one when none is given); `tries`: how many ports to
 * try from `port` on when it is taken; `sirapPort`: null for no SIRAP listener; `trustLoopback: false` asks the token of
 * this computer too (tests); `origins`: the sites whose pages may call the hub of their visitor's own computer.
 * Returns `{ port, sirapPort (null when it could not be had), token, name, folder, station, addresses(), events(), open(ev), close() }`.
 */
export async function startHub({ port = 8377, sirapPort = 10000, folder, assets, www, token, name, version = "", tries = 1,
  trustLoopback = true, origins = ["https://ozimut.com"] } = {}) {
  if (!folder || !assets || !www) throw new Error("startHub: folder, assets and www are needed");
  folder = path.resolve(folder);
  const root = path.resolve(assets), index = path.join(path.resolve(www), "index.html"), doc = path.join(path.resolve(www), "doc.html");
  token = String(token || crypto.randomBytes(12).toString("base64url"));
  name = String(name || os.hostname());
  fs.mkdirSync(folder, { recursive: true });

  // the hub's own station id, the same from one run to the next, and the event last opened
  const metaFile = path.join(folder, "hub.json");
  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(metaFile, "utf8")) || {}; } catch (e) { /* a first run, or a damaged file: a new station */ }
  const saveMeta = () => {
    try { fs.writeFileSync(metaFile + ".tmp", JSON.stringify(meta)); fs.renameSync(metaFile + ".tmp", metaFile); } catch (e) { /* the journals' own faults will say */ }
  };
  if (!isObj(meta) || !/^hub[a-z0-9]{4}$/.test(meta.station || "")) {
    const A = "abcdefghjkmnpqrstuvwxyz23456789";
    meta = { station: "hub" + [...crypto.randomBytes(4)].map((x) => A[x % A.length]).join("") };
    saveMeta();
  }

  // ---- the events: one log each, its journal behind it ----
  const logs = new Map();          // the id in lower case (Windows' file names ignore case) -> { ev, file, log, fd, cut, waiting, fault }
  const row = (ev, log, fault) => ({ ev, name: log.state.event.name || "", date: log.state.event.date || "", ops: log.ops.length, ...(fault ? { fault } : {}) });

  /** What waits goes to the journal's end and through to the disk; a failure keeps it for the next try. */
  function write(e) {
    if (!e.waiting.length) return;
    try {
      if (e.fd === null) {
        const made = !fs.existsSync(e.file);
        e.fd = fs.openSync(e.file, "a");
        if (made) { try { const d = fs.openSync(folder, "r"); fs.fsyncSync(d); fs.closeSync(d); } catch (x) { /* Windows has no such thing */ } }
      }
      const text = (e.cut ? "\n" : "") + e.waiting.map((o) => JSON.stringify(o) + "\n").join("");   // a cut line stays alone on its line
      e.cut = true;                                        // until all of it is written
      fs.appendFileSync(e.fd, text);
      fs.fsyncSync(e.fd);
      e.cut = false;
      e.waiting = [];
      e.fault = null;
    } catch (err) {
      e.fault = err.code || String(err.message || err);
      if (e.fd !== null) { try { fs.closeSync(e.fd); } catch (x) { /* already gone */ } e.fd = null; }
    }
  }
  const again = setInterval(() => { for (const e of logs.values()) write(e); }, 5000);
  again.unref();

  function open(ev) {
    if (typeof ev !== "string" || !EVENT_ID.test(ev) || DEVICE.test(ev)) throw new Error("event");
    const k = ev.toLowerCase();
    let e = logs.get(k);
    if (e && e.ev !== ev) throw new Error("event");        // the same id but for its case: on Windows, the same file
    if (!e) {
      const twin = fs.readdirSync(folder).map((f) => JOURNAL.exec(f)?.[1]).find((x) => x && x.toLowerCase() === k);
      if (twin && twin !== ev) throw new Error("event");
      const file = path.join(folder, `${ev}.ozchrono.jsonl`), { ops, cut } = readJournal(file);
      e = { ev, file, log: new Log(meta.station, ops), fd: null, cut, waiting: [], fault: null };
      e.log.on((added) => { e.waiting.push(...added); write(e); });
      logs.set(k, e);
    }
    if (meta.last !== ev) { meta.last = ev; saveMeta(); }
    return e.log;
  }

  const peeks = new Map();         // journals not opened: what is said of them, until the file changes
  function peek(ev) {
    const file = path.join(folder, `${ev}.ozchrono.jsonl`);
    try {
      const st = fs.statSync(file), sig = `${st.size}:${st.mtimeMs}`, had = peeks.get(ev);
      if (had?.sig === sig) return had.row;
      const r = row(ev, new Log("peek", readJournal(file).ops));
      peeks.set(ev, { sig, row: r });
      return r;
    } catch (e) { return null; }
  }
  /** The events of the folder and those open, the latest day first: `[{ ev, name, date, ops, fault? }]`. */
  function events() {
    const out = new Map();
    let files = [];
    try { files = fs.readdirSync(folder); } catch (e) { /* the folder went away: only what is open */ }
    for (const f of files) {
      const ev = JOURNAL.exec(f)?.[1];
      const r = ev && !logs.has(ev.toLowerCase()) ? peek(ev) : null;
      if (r) out.set(ev.toLowerCase(), r);
    }
    for (const [k, e] of logs) out.set(k, row(e.ev, e.log, e.fault));
    return [...out.values()].filter((r) => r.ops > 0)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || a.name.localeCompare(b.name) || (a.ev < b.ev ? -1 : 1));
  }

  // ---- who may ask ----
  const tokenOk = (k) => {
    if (typeof k !== "string" || !k) return false;
    const a = Buffer.from(k), b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const cookie = (req) => {
    const m = /(?:^|;\s*)ozk=([^;]*)/.exec(req.headers.cookie || "");
    try { return m ? decodeURIComponent(m[1]) : ""; } catch (e) { return ""; }
  };
  const okOrigin = (o, req) => o === `http://${req.headers.host}` || origins.includes(o) || LOCAL_ORIGIN.test(o);
  function local(req) {
    if (!trustLoopback || !LOOPBACK.test(req.socket.remoteAddress || "")) return false;
    const host = String(req.headers.host || "").replace(/:\d+$/, "").toLowerCase();
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "[::1]") return false;      // another name pointed at this computer
    return !req.headers.origin || okOrigin(req.headers.origin, req);
  }
  const allowed = (req, q) => local(req) || tokenOk(q.get("k")) || tokenOk(req.headers["x-hub-token"]) || tokenOk(cookie(req));
  const split = (url) => { const at = url.indexOf("?"); return at < 0 ? [url, new URLSearchParams()] : [url.slice(0, at), new URLSearchParams(url.slice(at + 1))]; };

  // ---- HTTP ----
  const send = (res, code, type, body, head = {}) => {
    res.writeHead(code, { "Content-Type": type, "Content-Length": Buffer.byteLength(body), "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", ...head });
    res.end(res.req.method === "HEAD" ? undefined : body);
  };
  const say = (res, code, head = {}) => send(res, code, "text/plain" + TEXT, code === 204 ? "" : String(code), head);

  function file(req, res, full, head) {
    fs.stat(full, (err, st) => {
      if (err || !st.isFile()) return say(res, 404);
      const tag = `W/"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
      const h = { "Content-Type": MIME[path.extname(full).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", ETag: tag, ...head };
      if (req.headers["if-none-match"] === tag) { res.writeHead(304, h); return res.end(); }
      res.writeHead(200, { ...h, "Content-Length": st.size });
      if (req.method === "HEAD" || !st.size) return res.end();
      fs.createReadStream(full, { start: 0, end: st.size - 1 }).on("error", () => res.destroy()).pipe(res);
    });
  }

  function serve(req, res) {
    const [raw, q] = split(req.url || "/");
    let p;
    try { p = decodeURIComponent(raw); } catch (e) { return say(res, 400); }
    if (!p.startsWith("/") || /[\0\\:]/.test(p) || p.split("/").some((s) => s === ".." || DEVICE.test(s))) return say(res, 403);
    const origin = req.headers.origin, cors = origin && okOrigin(origin, req) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
    if (req.method === "OPTIONS") {
      return say(res, cors.Vary ? 204 : 403, { ...cors, "Access-Control-Allow-Headers": "X-Hub-Token", "Access-Control-Allow-Private-Network": "true", "Access-Control-Max-Age": "600" });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return say(res, 405, { Allow: "GET, HEAD" });
    const page = p === "/" || p === "/index.html" || p === "/doc.html";       // doc.html: the app's documentation, for every station
    if (!allowed(req, q)) return page ? send(res, 401, "text/html" + TEXT, ASK) : send(res, 401, MIME[".json"], "{\"error\":\"token\"}", cors);
    const head = tokenOk(q.get("k")) ? { "Set-Cookie": `ozk=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict` } : {};
    if (page) return file(req, res, p === "/doc.html" ? doc : index, head);
    if (p.startsWith("/assets/")) {
      const full = path.join(root, p.slice(8));
      return full.startsWith(root + path.sep) ? file(req, res, full, head) : say(res, 403);
    }
    if (p === "/hub/info") return send(res, 200, MIME[".json"], JSON.stringify({ name, version, events: events() }), { ...cors, ...head });
    return say(res, 404);
  }
  const server = http.createServer((req, res) => {
    try { serve(req, res); } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(); }
  });

  // ---- the stations' sockets ----
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    socket.on("error", () => {});
    const [raw, q] = split(req.url || "/");
    if (raw !== "/hub") { socket.write("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n", () => socket.destroy()); return; }
    wss.handleUpgrade(req, socket, head, (ws) => station(ws, req, q));
  });
  function station(ws, req, q) {
    ws.alive = true;
    ws.on("pong", () => { ws.alive = true; });
    ws.on("error", () => {});
    if (!allowed(req, q)) return ws.close(4401, "token");
    const ev = q.get("ev") || "";
    let log;
    try { log = open(ev); } catch (e) { return ws.close(e.message === "event" ? 4400 : 1011, e.message === "event" ? "event" : "journal"); }
    const l = link(log, (m) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); }, { ev, name, onFault: () => ws.close(4400, "event") });
    ws.on("message", (data, binary) => {
      if (binary) return;
      let m;
      try { m = JSON.parse(data.toString()); } catch (e) { return; }
      if (!isObj(m)) return;
      if (m.t === "ops") m.ops = saneOps(m.ops);
      try { l.receive(m); } catch (e) { /* nothing a station sends stops the hub */ }
    });
    ws.on("close", () => l.close());
    l.open();
  }
  // a station that left without a word (a phone out of range) is dropped at the second beat it misses
  const beat = setInterval(() => {
    for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch (e) { /* closing */ } }
  }, 30000);
  beat.unref();

  // ---- radio punches (SIRAP), into the event last opened ----
  const relays = new Set();
  const at = (t) => (t == null ? null : { t });
  function radio(m) {
    const log = meta.last ? logs.get(meta.last.toLowerCase())?.log : null;
    if (!log) return;
    if (m.kind === "punch") {
      if (!m.code || !m.card || !Number.isFinite(m.t)) return;
      // the same punch relayed twice (two relays in reach of one control) is one punch
      if (log.state.radio.slice(-300).some((x) => x.code === m.code && x.card === m.card && x.s === m.t)) return;
      log.add("punch", { p: { code: m.code, card: m.card, s: m.t, at: Date.now(), src: "sirap" } }, "sirap");
    } else if (m.kind === "card" && m.card) {              // a whole card sent by a relay: a read like a reader's
      takeRead(log, { sys: "si", card: m.card, at: Date.now(), start: at(m.start), finish: at(m.finish), check: at(m.check), clear: null, punches: m.punches || [] }, "sirap");
    }
  }
  const sirap = net.createServer((sock) => {
    const dec = new SirapDecoder();
    relays.add(sock);
    sock.on("close", () => relays.delete(sock));
    sock.on("error", () => {});
    sock.on("data", (chunk) => {
      let msgs = [];
      try { msgs = dec.push(chunk); } catch (e) { sock.destroy(); return; }
      for (const m of msgs) { try { radio(m); } catch (e) { /* one bad packet does not close the relay's line */ } }
    });
  });

  // ---- listening ----
  const listen = (srv, p) => new Promise((ok, ko) => {
    srv.once("error", ko);
    srv.listen(p, () => { srv.off("error", ko); ok(srv.address().port); });
  });
  let bound = 0;
  for (let i = 0; ; i++) {
    try { bound = await listen(server, port ? port + i : 0); break; } catch (e) {
      if (e.code !== "EADDRINUSE" || !port || i + 1 >= tries) { clearInterval(again); clearInterval(beat); throw e; }
    }
  }
  server.on("error", () => {});
  let sirapBound = null;
  if (sirapPort !== null && sirapPort !== false) {
    try { sirapBound = await listen(sirap, sirapPort); } catch (e) { /* taken (another timing software on this computer): no radio by this way */ }
    sirap.on("error", () => {});
  }
  // radio punches have their event before any station is back
  if (typeof meta.last === "string" && fs.existsSync(path.join(folder, `${meta.last}.ozchrono.jsonl`))) { try { open(meta.last); } catch (e) { /* no longer an event */ } }

  return {
    port: bound, sirapPort: sirapBound, token, name, folder, station: meta.station,
    /** This computer's addresses on its networks (IPv4), for the other stations: `http://<address>:<port>/?k=<token>`. */
    addresses: () => Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === "IPv4" && !a.internal).map((a) => a.address),
    events,
    /** The event's log (read from its journal the first time); throws "event" for an id that is none. */
    open,
    async close() {
      clearInterval(again);
      clearInterval(beat);
      const down = (srv) => new Promise((ok) => { if (srv.listening) srv.close(() => ok()); else ok(); });
      const closing = [down(server), down(sirap)];
      for (const ws of wss.clients) ws.close(1001, "closing");
      for (const s of relays) s.destroy();
      for (let i = 0; i < 30 && wss.clients.size; i++) await new Promise((ok) => setTimeout(ok, 10));
      for (const ws of wss.clients) ws.terminate();
      server.closeAllConnections();
      await Promise.all(closing);
      for (const e of logs.values()) {
        write(e);
        if (e.fd !== null) { try { fs.closeSync(e.fd); } catch (x) { /* already gone */ } e.fd = null; }
      }
    },
  };
}
