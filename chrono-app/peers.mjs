// The apps of one arena find each other (docs/chrono/design.md, « Several computers »). Every app's hub says on the local
// network, every few seconds, who it is and which events it holds (a UDP broadcast, port 8379); a hub that hears of an
// event it holds too links to that hub by itself, and the two keep each other's copy in step — every hub is a station
// like any other, and a link may go through any of them. Nothing is a master: a computer may join or leave at any time.
//
// What protects an event is its code (six characters, `event.lan`, kept in the event's own log): a hub proves it knows it
// (an HMAC of the event's id) before another hub lets it in. The code never travels; the broadcast says only the events'
// ids, names and days. A computer that does not hold the event yet is given the code once by its user (the page's
// « Sur le réseau »), then links by itself, on this network and any other, as every hub holding the event does.
// No Electron here: the tests run it under Node.

import dgram from "node:dgram";
import os from "node:os";
import crypto from "node:crypto";
import { WebSocket } from "ws";
import { link } from "../site/assets/js/chrono/sync.js";

export const DISCOVERY_PORT = 8379;
export const STATION = /^hub[a-z0-9]{4}$/;
const EVENTS_SAID = 12, SEEN_FOR = 30000, RETRY = 5000, REFUSED_FOR = 60000;

/** What proves a hub knows an event's code. */
export const proofOf = (code, ev) => crypto.createHmac("sha256", String(code || "").trim().toUpperCase()).update(`oz-join:${ev}`).digest("base64url");
export function proofOk(given, code, ev) {
  if (typeof given !== "string" || !code) return false;
  const a = Buffer.from(given), b = Buffer.from(proofOf(code, ev));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** This computer's IPv4 broadcast addresses, and the general one. */
function broadcasts() {
  const out = new Set(["255.255.255.255"]);
  for (const a of Object.values(os.networkInterfaces()).flat()) {
    if (!a || a.family !== "IPv4" || a.internal || !a.netmask) continue;
    const ip = a.address.split(".").map(Number), mask = a.netmask.split(".").map(Number);
    out.add(ip.map((x, i) => (x & mask[i]) | (~mask[i] & 255)).join("."));
  }
  return [...out];
}

/**
 * `o`: `{ station, name, port (the hub's HTTP port), held() → [{ ev, name, date }], codeOf(ev), setCode(ev, code|null),
 * open(ev) → Log (without making it the event last opened), sane(ops) → ops, discovery: { port, to: [{ host, port }] } |
 * false (no broadcast: links by address only), statics: [{ host, port, k, ev }] }`. Returns the peers' control.
 */
export function startPeers(o) {
  const seen = new Map();          // station → { station, name, host, port, events: [{ ev, name, date }], at }
  const out = new Map();           // `${target}|${ev}` → an outgoing link
  const incoming = new Map();      // `${station}|${ev}` → count of links that hub opened to this one
  const wanted = new Set();        // events joined by this computer's user, not held yet
  const statics = [...(o.statics || [])];
  let sock = null, timer = null, closed = false;

  // ---- saying who we are ----
  const beacon = () => {
    const events = o.held().slice(0, EVENTS_SAID).map((e) => ({ ev: e.ev, n: String(e.name || "").slice(0, 40), d: e.date || "" }));
    return Buffer.from(JSON.stringify({ oz: "chrono", v: 1, id: o.station, name: String(o.name || "").slice(0, 40), port: o.port, events }));
  };
  function say() {
    if (!sock || closed) return;
    const b = beacon();
    const to = o.discovery.to || broadcasts().map((host) => ({ host, port: o.discovery.port || DISCOVERY_PORT }));
    for (const t of to) { try { sock.send(b, t.port, t.host); } catch (e) { /* an interface gone */ } }
  }
  function heard(msg, from) {
    let m;
    try { m = JSON.parse(msg.toString("utf8")); } catch (e) { return; }
    if (!m || m.oz !== "chrono" || m.id === o.station || !STATION.test(m.id || "") || !Number.isInteger(m.port)) return;
    const events = (Array.isArray(m.events) ? m.events : []).slice(0, EVENTS_SAID)
      .filter((e) => e && typeof e.ev === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(e.ev))
      .map((e) => ({ ev: e.ev, name: String(e.n || "").slice(0, 60), date: String(e.d || "").slice(0, 10) }));
    seen.set(m.id, { station: m.id, name: String(m.name || "").slice(0, 40), host: from.address, port: m.port, events, at: Date.now() });
    consider(seen.get(m.id));
  }
  if (o.discovery !== false) {
    sock = dgram.createSocket({ type: "udp4", reuseAddr: true });
    sock.on("error", () => { /* the port taken, no network: links by address still work */ });
    sock.on("message", heard);
    sock.bind(o.discovery?.port ?? DISCOVERY_PORT, () => { try { sock.setBroadcast(true); } catch (e) { /* none */ } say(); });
  }

  // ---- linking ----
  const holds = (ev) => o.held().some((e) => e.ev === ev);
  function consider(p) {
    for (const e of p.events) {
      const mine = holds(e.ev);
      if (!mine && !wanted.has(e.ev)) continue;
      if (!o.codeOf(e.ev)) continue;
      // one link between two hubs: the smaller id dials, unless this one has just joined and waits for the event
      if (incoming.get(`${p.station}|${e.ev}`)) continue;
      if (mine && o.station > p.station && !wanted.has(e.ev)) continue;
      dial({ key: `${p.station}|${e.ev}`, host: p.host, port: p.port, ev: e.ev, peer: p.station, auth: { lan: proofOf(o.codeOf(e.ev), e.ev) } });
    }
  }
  function dial(t) {
    let l = out.get(t.key);
    if (l && (l.state === "on" || l.state === "connecting" || l.timer || (l.state === "refused" && Date.now() < l.until))) return l;
    if (!l) { l = { ...t, state: "off", name: seen.get(t.peer)?.name || t.host, waiters: [] }; out.set(t.key, l); }
    Object.assign(l, t);
    l.state = "connecting";
    const u = new URL(`ws://${t.host.includes(":") ? `[${t.host}]` : t.host}:${t.port}/hub`);
    u.searchParams.set("ev", t.ev);
    u.searchParams.set("peer", o.station);
    for (const [k, v] of Object.entries(t.auth)) u.searchParams.set(k, v);
    let ws;
    try { ws = new WebSocket(u.toString(), { handshakeTimeout: 4000 }); } catch (e) { l.state = "lost"; return later(l); }
    l.ws = ws;
    let lk = null;
    ws.on("open", () => {
      let log;
      try { log = o.open(t.ev); } catch (e) { ws.close(); return; }
      lk = link(log, (m) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); }, { ev: t.ev, name: o.name });
      lk.open();
    });
    ws.on("message", (data, binary) => {
      if (binary || !lk) return;
      let m;
      try { m = JSON.parse(data.toString()); } catch (e) { return; }
      if (!m || typeof m !== "object") return;
      if (m.t === "ops") m.ops = o.sane(m.ops);
      if (m.t === "hello") { l.state = "on"; l.name = m.name || l.name; settle(l, "ok"); }
      try { lk.receive(m); } catch (e) { /* nothing a peer sends stops the hub */ }
    });
    ws.on("error", () => { /* close follows */ });
    ws.on("close", (code) => {
      lk?.close(); lk = null; l.ws = null;
      if (closed) return;
      if (code === 4401) { l.state = "refused"; l.until = Date.now() + REFUSED_FOR; settle(l, "code"); return; }
      l.state = "lost";
      settle(l, "unreachable");
      later(l);
    });
    return l;
  }
  // dialled again while its hub is still heard of (or always, for an address typed by hand)
  function later(l) {
    if (closed || l.timer) return;
    l.timer = setTimeout(() => {
      l.timer = null;
      if (incoming.get(l.key)) return;
      const p = seen.get(l.peer);
      if (l.fixed || (p && Date.now() - p.at < SEEN_FOR)) dial({ ...l, host: p?.host || l.host, port: p?.port || l.port });
    }, RETRY);
  }
  function settle(l, how) { const w = l.waiters.splice(0); for (const f of w) f(how); }

  for (const s of statics) dial({ key: `${s.host}:${s.port}|${s.ev}`, host: s.host, port: s.port, ev: s.ev, peer: "", fixed: true, auth: { k: s.k } });
  timer = setInterval(() => {
    say();
    for (const [id, p] of seen) if (Date.now() - p.at > SEEN_FOR * 4) seen.delete(id);
  }, 5000);
  timer.unref?.();

  return {
    /** A hub opened a link to this one (`station`: its id, from the link's address). Returns what to call when it closes. */
    incoming(station, ev) {
      const k = `${station}|${ev}`;
      incoming.set(k, (incoming.get(k) || 0) + 1);
      // two hubs that dialled each other at once keep one link: the one the smaller id opened
      const mine = out.get(k);
      if (mine?.ws && station < o.station) { try { mine.ws.close(1000); } catch (e) { /* gone */ } }
      return () => { const n = (incoming.get(k) || 1) - 1; if (n > 0) incoming.set(k, n); else incoming.delete(k); };
    },
    /**
     * The user joins an event heard of on the network, with its code. Resolves to "ok" (a hub let this one in), "code"
     * (refused: not that event's code), "unreachable" or "none" (no hub holding it heard of).
     */
    join(ev, code) {
      const c = String(code || "").trim().toUpperCase();
      const holders = [...seen.values()].filter((p) => p.events.some((e) => e.ev === ev) && Date.now() - p.at < SEEN_FOR);
      if (!holders.length) return Promise.resolve("none");
      o.setCode(ev, c);
      wanted.add(ev);
      const tries = holders.map((p) => new Promise((done) => {
        for (const old of [out.get(`${p.station}|${ev}`)]) if (old && old.state === "refused") old.until = 0;
        const l = dial({ key: `${p.station}|${ev}`, host: p.host, port: p.port, ev, peer: p.station, auth: { lan: proofOf(c, ev) } });
        if (l.state === "on") return done("ok");
        l.waiters.push(done);
        setTimeout(() => done("unreachable"), 8000);
      }));
      return Promise.all(tries).then((r) => {
        const how = r.includes("ok") ? "ok" : r.includes("code") ? "code" : "unreachable";
        if (how !== "ok") { wanted.delete(ev); if (how === "code") o.setCode(ev, null); }
        return how;
      });
    },
    /** A hub given by its address and key (a network where broadcasts do not pass): linked for that event, kept. */
    addStatic(host, port, k, ev) {
      const s = { host, port, k, ev };
      if (!statics.some((x) => x.host === host && x.port === port && x.ev === ev)) statics.push(s);
      const l = dial({ key: `${host}:${port}|${ev}`, host, port, ev, peer: "", fixed: true, auth: { k } });
      return new Promise((done) => { if (l.state === "on") return done("ok"); l.waiters.push(done); setTimeout(() => done("unreachable"), 8000); });
    },
    statics: () => statics.map((s) => ({ ...s })),
    /** The other hubs heard of lately, and the links to them. */
    info() {
      const now = Date.now();
      const hubs = [...seen.values()].filter((p) => now - p.at < SEEN_FOR).map((p) => ({ station: p.station, name: p.name, host: p.host, port: p.port, events: p.events.map((e) => e.ev) }));
      const links = [];
      for (const l of out.values()) links.push({ ev: l.ev, station: l.peer, name: l.name, host: l.host, state: l.state, way: "out" });
      for (const [k, n] of incoming) if (n > 0) { const [station, ev] = k.split("|"); links.push({ ev, station, name: seen.get(station)?.name || "", host: seen.get(station)?.host || "", state: "on", way: "in" }); }
      const mine = new Set(o.held().map((e) => e.ev)), network = new Map();
      for (const p of seen.values()) {
        if (now - p.at >= SEEN_FOR) continue;
        for (const e of p.events) {
          if (mine.has(e.ev)) continue;
          const n = network.get(e.ev) || network.set(e.ev, { ev: e.ev, name: e.name, date: e.date, from: [] }).get(e.ev);
          n.from.push(p.name);
        }
      }
      return { hubs, links, network: [...network.values()] };
    },
    async close() {
      closed = true;
      clearInterval(timer);
      for (const l of out.values()) { clearTimeout(l.timer); try { l.ws?.terminate(); } catch (e) { /* gone */ } }
      if (sock) await new Promise((ok) => { try { sock.close(ok); } catch (e) { ok(); } });
    },
  };
}
