// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// A station's links: the cloud (Ozimut keeps the event's operations: other computers catch up, the race is safe if this one
// dies), a hub (the desktop app, on this computer or on the arena's network) and the live results. All of it is optional:
// a station alone, offline, keeps everything itself.

import { link, cloudSync } from "../sync.js";
import { toLive } from "../view.js";

export const APP_PORT = 8377;

/**
 * `ctx`: `{ ev, log (the log in use), view(), rules(), change() }`; `opt`: `{ base (the site's address, "" for this one),
 * session (true: the page is signed in on Ozimut), hubUrl (the hub that served the page) }`.
 */
export function makeNet(ctx, opt = {}) {
  const N = {
    cloud: { on: !!opt.session, state: opt.session ? "idle" : "off", last: 0, error: "", sent: 0, got: 0 },
    hub: { state: "off", url: "", peer: null, error: "" },
    live: { state: "off", last: 0, id: null, error: "" },
  };
  const mem = {};
  let timer = null, busy = false, ws = null, lk = null, retry = null, closed = false, liveSig = "";

  const cloudOf = () => {
    const c = ctx.log.state.event.cloud;
    if (opt.session) return { base: opt.base || "", token: null };
    return c?.token ? { base: c.url || "", token: c.token } : null;
  };
  const call = async (path, body) => {
    const c = cloudOf();
    if (!c) throw new Error("nocloud");
    const r = await fetch(`${c.base}/api/chrono/${encodeURIComponent(ctx.ev)}/${path}`, { method: "POST", credentials: c.token ? "omit" : "same-origin",
      headers: { "Content-Type": "application/json", ...(c.token ? { "X-Chrono-Token": c.token } : {}) }, body: JSON.stringify(body) });
    if (!r.ok) { const e = new Error(String(r.status)); e.status = r.status; throw e; }
    return r.json();
  };

  N.call = call;
  N.signedIn = !!opt.session;
  /** One exchange with the cloud now; resolves to true when both sides hold the same. */
  N.sync = async () => {
    if (busy || ctx.sandbox?.() || !cloudOf()) return false;
    if (typeof navigator !== "undefined" && navigator.onLine === false) { N.cloud.state = "offline"; ctx.change(); return false; }
    busy = true; N.cloud.state = "sync"; ctx.change();
    try {
      let more = true, guard = 0;
      while (more && guard++ < 20) { const r = await cloudSync(ctx.log, (b) => call("sync", b), mem); N.cloud.sent += r.sent; N.cloud.got += r.got; more = r.more; }
      N.cloud.state = "ok"; N.cloud.last = Date.now(); N.cloud.error = "";
      return true;
    } catch (e) {
      N.cloud.state = e.status === 401 || e.status === 403 ? "refused" : "error"; N.cloud.error = e.message;
      return false;
    } finally { busy = false; ctx.change(); }
  };
  /** A token for the stations that are not signed in (asked once by a signed-in page, then carried by the log). */
  N.shareCloud = async () => {
    const r = await call("token", {});
    ctx.log.add("ev", { p: { cloud: { url: location.origin, token: r.token } } });
    return r.token;
  };
  const pending = () => ctx.log.since(mem.have || {}).length;
  N.pending = () => (cloudOf() ? pending() : 0);

  async function pushLive() {
    const ev = ctx.log.state.event;
    if (!ev.live || !cloudOf() || ctx.sandbox?.()) { N.live.state = "off"; return; }
    const body = toLive(ctx.view(), ctx.rules().resultsBy === "course" ? "course" : "class"), sig = JSON.stringify(body);
    if (sig === liveSig && Date.now() - N.live.last < 120000) return;
    try {
      const r = await call("live", { name: ev.name, date: ev.date, club: ev.club || "", race: ev.race || null, live: body });
      N.live = { state: "ok", last: Date.now(), id: r.id || N.live.id, error: "" }; liveSig = sig;
    } catch (e) { N.live.state = "error"; N.live.error = e.message; }
    ctx.change();
  }

  N.start = () => {
    let n = 0;
    timer = setInterval(() => {
      n++;
      if (cloudOf() && !busy && (pending() || n % 8 === 0 || N.cloud.state === "idle")) N.sync();
      if (n % 5 === 0) pushLive();
      pollHub();
    }, 4000);
    if (typeof window !== "undefined") window.addEventListener("online", N.sync);
    if (opt.hubUrl) N.joinHub(opt.hubUrl);
  };

  /** A link to a hub: `url` like `ws://192.168.1.20:8377/hub?k=…` (the event is added). Reconnects by itself. */
  N.joinHub = (url) => {
    N.leaveHub(true);
    closed = false;
    N.hub.url = url;
    const open = () => {
      if (closed) return;
      N.hub.state = "connecting"; ctx.change();
      const u = new URL(url);
      u.searchParams.set("ev", ctx.ev);
      try { ws = new WebSocket(u.toString()); } catch (e) { N.hub.state = "error"; N.hub.error = e.message; ctx.change(); return; }
      const sock = ws;
      sock.onopen = () => {
        lk = link(ctx.log, (m) => { if (sock.readyState === 1) sock.send(JSON.stringify(m)); }, { ev: ctx.ev, name: opt.name || "",
          onPeer: (p) => { N.hub.peer = p; ctx.change(); }, onFault: (w) => { N.hub.error = w; N.hub.state = "refused"; closed = true; sock.close(); ctx.change(); } });
        lk.open();
        N.hub.state = "on"; N.hub.error = ""; ctx.change(); pollHub();
      };
      sock.onmessage = (e) => { try { lk?.receive(JSON.parse(e.data)); } catch (err) { /* not ours */ } };
      sock.onclose = (e) => {
        lk?.close(); lk = null;
        if (closed) return;
        N.hub.state = e.code === 4401 ? "refused" : "lost"; ctx.change();
        if (e.code !== 4401) retry = setTimeout(open, 3000);
      };
      sock.onerror = () => { /* onclose follows */ };
    };
    open();
  };
  N.leaveHub = (quiet = false) => {
    closed = true; clearTimeout(retry);
    lk?.close(); lk = null;
    try { ws?.close(); } catch (e) { /* gone */ }
    ws = null;
    N.hub = { state: "off", url: "", peer: null, error: "", info: null, sig: "" };
    if (!quiet) ctx.change();
  };
  /** Is the desktop app running on this computer? Resolves to its info, or null. */
  N.findApp = async () => {
    // the app takes the first free port from its usual one
    const tries = await Promise.all(Array.from({ length: 11 }, (_, i) => fetch(`http://127.0.0.1:${APP_PORT + i}/hub/info`, { signal: AbortSignal.timeout(1500) })
      .then(async (r) => (r.ok ? { ...(await r.json()), port: APP_PORT + i } : null)).catch(() => null)));
    return tries.find(Boolean) || null;
  };
  /** The hub's HTTP address (http://host:port), from its socket's; null when none. */
  N.hubBase = () => { try { const u = new URL(N.hub.url); return `${u.protocol === "wss:" ? "https:" : "http:"}//${u.host}`; } catch (e) { return null; } };
  const hubKey = () => { try { return new URL(N.hub.url).searchParams.get("k") || ""; } catch (e) { return ""; } };
  /** The hub's `/hub/info`: its addresses, key, the other hubs and the links to them. */
  N.hubInfo = async () => {
    const b = N.hubBase();
    if (!b) return null;
    const r = await fetch(`${b}/hub/info`, { headers: hubKey() ? { "X-Hub-Token": hubKey() } : {}, signal: AbortSignal.timeout(3000) });
    return r.ok ? r.json() : null;
  };
  /** The computers this event is linked to through the hub (its own page apart). */
  N.linked = () => (N.hub.info?.peers?.links || []).filter((l) => l.ev === ctx.ev && l.state === "on")
    .filter((l, i, a) => a.findIndex((x) => x.station === l.station) === i);
  /** True where this page may ask its hub to link (the app's own window, or a page of this computer). */
  N.local = () => { const b = N.hubBase(); return !!b && /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(b); };
  /** Another computer's hub given by hand (a network that drops the discovery): "ok" | "code" | "unreachable". */
  N.addPeer = async (host, port, k) => {
    const q = new URLSearchParams({ host, port: String(port || APP_PORT), k, ev: ctx.ev });
    const r = await fetch(`${N.hubBase()}/hub/peer?${q}`, { signal: AbortSignal.timeout(15000) });
    return r.ok ? (await r.json()).result : "unreachable";
  };
  async function pollHub() {
    if (N.hub.state !== "on") { if (N.hub.info) { N.hub.info = null; ctx.change(); } return; }
    try {
      const i = await N.hubInfo(), sig = JSON.stringify(i?.peers || null) + (i?.addresses || []).join();
      if (sig !== N.hub.sig) { N.hub.info = i; N.hub.sig = sig; ctx.change(); }
    } catch (e) { /* asked again */ }
  }
  /** The log in use changed (the rehearsal's copy, back to the real one): links follow the real one only. */
  N.relink = () => { if (N.hub.url && !ctx.sandbox?.()) N.joinHub(N.hub.url); };
  N.stop = () => { clearInterval(timer); N.leaveHub(true); if (typeof window !== "undefined") window.removeEventListener("online", N.sync); };
  return N;
}
