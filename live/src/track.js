// LiveTrack (docs/track/design.md « Watch pages », « Alerts »; 2026-11-21): one Durable Object per followed account,
// `idFromName("u<id>")`. Ozimut's Function /api/track/push hands it each batch of fixes; the watchers' pages connect by
// WebSocket (functions/ws/track/[user].js) and get the run so far, then each batch; an alarm every 30 s during a run
// computes the alerts and posts them to Ozimut (POST <SITE_URL>/api/track/alert, header X-Relay = TRACK_RELAY_SECRET),
// which notifies the watchers' devices. Only the run under way is kept here (Ozimut's R2 keeps every run).

import { DurableObject } from "cloudflare:workers";

const TICK_MS = 30000;
const SILENT_S = 180, STILL_S = 300, STILL_M = 15, LOW_BAT = 15, BACK_AWAY_S = 600, BACK_M = 50, AWAY_M = 200;
const RECENT_S = 360;                  // the positions kept for the « still » test
const MAX_KEEP = 7 * 3600;             // a run's fixes kept here at most (seconds)

function metres(la1, lo1, la2, lo2) {
  const R = 6371000, r = Math.PI / 180 / 1e6;
  const dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r;
  const h = Math.sin(dla / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Absolute fixes [t, la, lo, ac] -> the trace form (deltas). */
function encode(pts) {
  const out = { v: 1, t0: pts.length ? pts[0][0] : 0, dt: [], la: [], lo: [], ac: [] };
  let p = null;
  for (const q of pts) {
    out.dt.push(p ? q[0] - p[0] : 0); out.la.push(p ? q[1] - p[1] : q[1]); out.lo.push(p ? q[2] - p[2] : q[2]); out.ac.push(q[3] || 0);
    p = q;
  }
  return out;
}

export class LiveTrack extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.m = null;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async load() {
    if (this.m) return this.m;
    this.m = (await this.ctx.storage.get("head")) || { run: null };
    return this.m;
  }
  async fixes() {
    const out = [];
    for (const [, v] of await this.ctx.storage.list({ prefix: "f:" })) for (let i = 0; i < v.t.length; i++) out.push([v.t[i], v.la[i], v.lo[i], v.ac[i] || 0]);
    out.sort((a, b) => a[0] - b[0]);
    return out;
  }
  send(ws, msg) { try { ws.send(JSON.stringify(msg)); } catch (e) { /* closed */ } }
  broadcast(msg) { const s = JSON.stringify(msg); for (const ws of this.ctx.getWebSockets()) { try { ws.send(s); } catch (e) { /* closed */ } } }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/push" && request.method === "POST") return this.push(await request.json());
    if (url.pathname === "/stop" && request.method === "POST") return this.stop(await request.json());
    if (url.pathname === "/state") {
      const m = await this.load();
      return Response.json({ run: m.run, state: m.state, last: m.last || null, bat: m.bat ?? null, watchers: this.ctx.getWebSockets().length });
    }
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket expected", { status: 426 });
    const m = await this.load();
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    this.send(server, { t: "hello", run: m.run, name: m.name || "", state: m.state || null, batch: m.batch || 30,
      fixes: m.run ? encode(await this.fixes()) : null, bat: m.bat ?? null, lp: !!m.lp, last: m.lastAt || null, start: m.startPos || null });
    // a page watching: the device is told to send every `batch` seconds from its next batch (the answer to its push)
    return new Response(null, { status: 101, webSocket: client });
  }

  async push(b) {
    let m = await this.load();
    const now = Date.now();
    const alerts = [];
    if (m.run !== b.run) {
      // a new run: the former one's fixes go
      await this.ctx.storage.deleteAll();
      m = this.m = { run: b.run, uid: b.uid, name: b.name, startedAt: b.startedAt, state: "run", sent: {}, recent: [], away: false };
      alerts.push({ kind: "start" });
    }
    const n = b.t?.length || 0;
    if (n) {
      await this.ctx.storage.put(`f:${String(b.seq).padStart(6, "0")}`, { t: b.t, la: b.la, lo: b.lo, ac: b.ac });
      m.startPos ||= [b.la[0], b.lo[0]];
      m.last = [b.la[n - 1], b.lo[n - 1], b.t[n - 1]];
      for (let i = 0; i < n; i++) m.recent.push([b.t[i], b.la[i], b.lo[i]]);
      const cut = b.t[n - 1] - RECENT_S;
      m.recent = m.recent.filter((p) => p[0] >= cut);
      // over 200 m from the start once: the « back » alert can come later
      if (metres(m.startPos[0], m.startPos[1], m.last[0], m.last[1]) > AWAY_M) m.away = true;
    }
    m.name = b.name || m.name; m.uid = b.uid; m.batch = b.batch || 30; m.cap = b.cap; m.area = b.area || null;
    if (b.bat != null) m.bat = b.bat;
    m.lp = !!b.lp; m.lastAt = now;
    if (b.state === "help" && m.state !== "help") alerts.push({ kind: "help", pos: m.last });
    if (b.state === "end" && m.state !== "end") alerts.push({ kind: "end" });
    m.state = b.state === "end" ? "end" : b.state === "help" ? "help" : m.state === "help" ? "help" : "run";
    m.sent.silent = false;                         // a batch came: a later silence is news again
    if (m.bat != null && m.bat < LOW_BAT && !m.sent.battery) { m.sent.battery = true; alerts.push({ kind: "battery", bat: m.bat }); }
    if (m.area && m.last) {
      const out = metres(Math.round(m.area.lat * 1e6), Math.round(m.area.lon * 1e6), m.last[0], m.last[1]) > m.area.r;
      if (out && !m.sent.area) { m.sent.area = true; alerts.push({ kind: "area", pos: m.last }); }
      if (!out) m.sent.area = false;
    }
    if (m.away && !m.sent.back && m.last && now - m.startedAt > BACK_AWAY_S * 1000
      && metres(m.startPos[0], m.startPos[1], m.last[0], m.last[1]) < BACK_M) { m.sent.back = true; alerts.push({ kind: "back" }); }
    await this.ctx.storage.put("head", m);
    if (n) this.broadcast({ t: "fixes", run: m.run, seq: b.seq, ...encode(b.t.map((t, i) => [t, b.la[i], b.lo[i], b.ac[i]])), bat: m.bat ?? null, lp: m.lp, at: now });
    if (b.state === "help" || b.state === "end") this.broadcast({ t: "state", run: m.run, state: m.state, at: now });
    for (const a of alerts) { this.broadcast({ t: "alert", ...a, at: now }); await this.alert(a); }
    if (m.state !== "end") await this.ctx.storage.setAlarm(now + TICK_MS);
    return Response.json({ watchers: this.ctx.getWebSockets().length });
  }

  async stop(b) {
    const m = await this.load();
    if (m.run !== b.run) return Response.json({ ok: true });
    m.state = "end";
    await this.ctx.storage.put("head", m);
    this.broadcast({ t: "state", run: m.run, state: "stop", at: Date.now() });
    return Response.json({ ok: true });
  }

  async alarm() {
    const m = await this.load();
    if (!m.run || m.state === "end") return;
    const now = Date.now();
    // a run silent beyond its cap and half an hour: given up (Ozimut lists it as interrupted)
    if (m.cap && now - m.startedAt > (m.cap + 1800) * 1000 && now - m.lastAt > 1800e3) { m.state = "end"; await this.ctx.storage.put("head", m); return; }
    if (now - m.lastAt > SILENT_S * 1000 && !m.sent.silent) {
      m.sent.silent = true;
      this.broadcast({ t: "alert", kind: "silent", at: now });
      await this.alert({ kind: "silent", pos: m.last });
    }
    // within 15 m for the last 5 minutes (a fall, a child lost and waiting): once, until the runner moves again
    const r = m.recent || [];
    if (m.last && r.length && m.last[2] - r[0][0] >= STILL_S - 30) {
      const since = m.last[2] - STILL_S;
      const win = r.filter((p) => p[0] >= since);
      const still = win.length >= 10 && win.every((p) => metres(p[1], p[2], m.last[0], m.last[1]) < STILL_M);
      if (still && !m.sent.still) { m.sent.still = true; this.broadcast({ t: "alert", kind: "still", at: now }); await this.alert({ kind: "still", pos: m.last }); }
      if (!still) m.sent.still = false;
    }
    await this.ctx.storage.put("head", m);
    await this.ctx.storage.setAlarm(now + TICK_MS);
  }

  async alert(a) {
    const m = this.m;
    if (!this.env.TRACK_RELAY_SECRET || !this.env.SITE_URL) return;
    try {
      await fetch(`${this.env.SITE_URL.replace(/\/+$/, "")}/api/track/alert`, { method: "POST",
        headers: { "Content-Type": "application/json", "X-Relay": this.env.TRACK_RELAY_SECRET },
        body: JSON.stringify({ user: m.uid, run: m.run, ...a }) });
    } catch (e) { /* the site unreachable: the page still shows it */ }
  }

  async webSocketMessage(ws, raw) { if (raw === "ping") { try { ws.send("pong"); } catch (e) { /* closed */ } } }
  async webSocketClose(ws, code) { try { ws.close(code, "bye"); } catch (e) { /* closed */ } }
}
