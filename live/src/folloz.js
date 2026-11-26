// TracChannel (docs/track/folloz.md; 2026-11-23): one Durable Object per Folloz channel, `idFromName(<c>)`. Folloz needs
// no account: a followed phone (the watchee) holds the channel's secret, each phone following it (a watcher) a secret of its
// own, and every batch arrives sealed for each watcher with a key the relay never sees. The object keeps the head (the secrets'
// hashes, the watchers, the open codes, the run under way) and the run's sealed batches, one key a watcher and batch, deleted
// 24 h after the run's end or when the next run starts. Ozimut's Function functions/api/folloz/[[path]].js hands it every
// request (the secrets as they came: the object hashes and compares them) and sends the notifications it asks for; the
// object's alarm notices a silent run and posts that alert to Ozimut (POST <SITE_URL>/api/folloz/alert, X-Relay).
// A run's pace (Direct or long, « Pace », 2026-11-25) comes with each batch; a watcher's request for Direct is kept as the
// run's `boost`, given back in every batch's answer and sent to the runner's phone through its own push token.

import { DurableObject } from "cloudflare:workers";

const WATCHED = 15, IDLE = 120;            // the next batch, in seconds, with / without a watcher looking (45 s)
const LOOKING_S = 45;
const SILENT_S = 180;                      // no batch for that long during a run: « silent »
const ABANDON_S = 6 * 3600;                // a run without a batch for that long is over
const LONG_ABANDON_S = 36 * 3600;          // the same for a long run (« Pace »: mountains without a network for hours)
const KEEP_S = 24 * 3600;                  // a run's batches kept after its end
const IDLE_CHANNEL_S = 180 * 86400;        // a channel nobody used for that long goes
const PACE_GAP_S = 15, MAX_BOOST_MIN = 60; // a watcher's requests for Direct: one each 15 s, an hour at most
const MAX_WATCHERS = 20, MAX_INVITES = 10, CODE_S = 24 * 3600;
const DEVICE_ALERTS = new Set(["battery", "still", "zone"]);
const A32 = "abcdefghijklmnopqrstuvwxyz234567";

const enc = new TextEncoder();
async function sha(s) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(s))));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}
function rand32(n) {
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, (x) => A32[x & 31]).join("");
}
function randKey() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const now = () => Math.floor(Date.now() / 1000);
const iso = (s) => (s ? new Date(s * 1000).toISOString() : null);
const pad = (n) => String(n).padStart(7, "0");
const bearer = (request) => (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
const err = (error, status) => Response.json({ error }, { status });

export class TracChannel extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.m = undefined;
  }

  async head() {
    if (this.m === undefined) this.m = (await this.ctx.storage.get("h")) || null;
    return this.m;
  }
  async save() { await this.ctx.storage.put("h", this.m); }

  async isWatchee(request) {
    const s = bearer(request);
    return !!s && (await sha(s)) === this.m.csh;
  }
  async watcherOf(request, w) {
    const s = bearer(request), x = this.m.watchers[w];
    return x && s && (await sha(s)) === x.h ? x : null;
  }

  /** The tokens to notify for these alerts: { notify: [{ push, data, urgent }] }. */
  notifications(alerts) {
    const out = [];
    for (const a of alerts) {
      for (const [w, x] of Object.entries(this.m.watchers)) {
        if (!x.push) continue;
        out.push({ w, push: x.push, urgent: ["help", "silent", "zone"].includes(a.kind),
          data: { app: "folloz", c: this.m.c, kind: a.kind, t: String(a.t), run: this.m.run?.id || "" } });
      }
    }
    return out;
  }

  async dropBlobs(w) {
    const prefix = w ? `b:${w}:` : "b:";
    for (;;) {
      const keys = [...(await this.ctx.storage.list({ prefix, limit: 512 })).keys()];
      if (!keys.length) break;
      for (let i = 0; i < keys.length; i += 128) await this.ctx.storage.delete(keys.slice(i, i + 128));   // 128 keys a call at most
    }
  }

  /** The alarm only when something can happen: the run's silence, then its abandon (a long run is quiet for 10 minutes at a
   *  time; waking every minute for days would be wasted requests). */
  async plan() {
    const m = this.m, t = now();
    let at;
    if (m.run && m.run.state !== "end") at = Math.max(t + 5, m.run.last + (m.run.silent ? abandonS(m.run) : silentS(m.run)) + 1);
    else if (m.run) at = m.run.ended + KEEP_S + 5;
    else at = (m.touched || t) + IDLE_CHANNEL_S + 5;
    await this.ctx.storage.setAlarm(at * 1000);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+|\/+$/g, "");
    const method = request.method;
    const body = method === "GET" || method === "DELETE" ? null : await request.json().catch(() => null);

    if (path === "init" && method === "POST") {
      if (await this.head()) return err("exists", 409);
      const t = now();
      this.m = { c: String(body?.c || ""), csh: String(body?.csh || ""), created: t, touched: t, watchers: {}, invites: {}, run: null };
      await this.save();
      await this.plan();
      return Response.json({ ok: true }, { status: 201 });
    }

    const m = await this.head();
    if (!m) return err("channel", 404);
    const t = now();

    // the watchee's view of its channel
    if (path === "" && method === "GET") {
      if (!(await this.isWatchee(request))) return err("secret", 401);
      if (t - m.touched > 3600) { m.touched = t; await this.save(); }
      return Response.json({
        watchers: Object.entries(m.watchers).map(([w, x]) => ({ w, name: x.name, since: iso(x.since), seen: iso(x.seen) })),
        run: m.run ? { run: m.run.id, state: m.run.state, started: iso(m.run.started), last: iso(m.run.last), seq: m.run.seq } : null,
      });
    }

    if (path === "" && method === "DELETE") {
      if (!(await this.isWatchee(request))) return err("secret", 401);
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
      this.m = null;
      return Response.json({ ok: true });
    }

    if (path === "invite" && method === "POST") {
      if (!(await this.isWatchee(request))) return err("secret", 401);
      const i = String(body?.i || "");
      if (!/^[a-z2-7]{16}$/.test(i)) return err("bad request", 400);
      for (const [k, exp] of Object.entries(m.invites)) if (exp < t) delete m.invites[k];
      if (Object.keys(m.invites).length >= MAX_INVITES) return err("too many", 429);
      m.invites[await sha(i)] = t + CODE_S;
      m.touched = t;
      await this.save();
      return Response.json({ exp: iso(t + CODE_S) });
    }

    if (path === "join" && method === "POST") {
      const i = String(body?.i || ""), name = String(body?.name || "");
      if (!/^[a-z2-7]{16}$/.test(i) || !/^[A-Za-z0-9_-]{20,600}$/.test(name)) return err("bad request", 400);
      const ih = await sha(i);
      if (!(m.invites[ih] > t)) return err("code", 409);
      if (Object.keys(m.watchers).length >= MAX_WATCHERS) return err("too many", 429);
      delete m.invites[ih];
      let w;
      do w = rand32(8); while (m.watchers[w]);
      const ws = randKey();
      m.watchers[w] = { h: await sha(ws), name, since: t, seen: null, push: cleanPush(body?.push) };
      m.touched = t;
      await this.save();
      return Response.json({ w, ws });
    }

    if (path === "push" && method === "POST") {
      if (!(await this.isWatchee(request))) return err("secret", 401);
      return this.push(body, t);
    }

    // the watchee's own push token: how a watcher's request for Direct wakes its phone
    if (path === "token" && method === "PUT") {
      if (!(await this.isWatchee(request))) return err("secret", 401);
      m.token = cleanPush(body);
      m.touched = t;
      await this.save();
      return Response.json({ ok: true });
    }

    // internal (Ozimut's Function, never forwarded from outside): tokens the push services call gone ("@": the watchee's)
    if (path === "_gone" && method === "POST") {
      for (const w of Array.isArray(body?.w) ? body.w : []) {
        if (w === "@") m.token = null;
        else if (m.watchers[w]) m.watchers[w].push = null;
      }
      await this.save();
      return Response.json({ ok: true });
    }

    const wm = path.match(/^w\/([a-z2-7]{8})(\/push|\/pace)?$/);
    if (wm) {
      const w = wm[1];
      if (method === "DELETE") {
        const ok = (await this.isWatchee(request)) || (await this.watcherOf(request, w));
        if (!ok) return err("secret", 401);
        if (!m.watchers[w]) return Response.json({ ok: true });
        delete m.watchers[w];
        await this.dropBlobs(w);
        m.touched = t;
        await this.save();
        return Response.json({ ok: true });
      }
      const x = await this.watcherOf(request, w);
      if (!x) return err("secret", 401);
      if (wm[2] === "/push" && method === "PUT") {
        x.push = cleanPush(body);
        await this.save();
        return Response.json({ ok: true });
      }
      if (wm[2] === "/pace" && method === "POST") return this.pace(w, x, body, t);
      if (!wm[2] && method === "GET") return this.read(w, x, url, t);
    }
    return err("bad request", 400);
  }

  /** A watchee's batch. */
  async push(b, t) {
    const m = this.m;
    if (!b || b.v !== 1 || !/^[A-Za-z0-9_:.-]{4,64}$/.test(String(b.run || "")) || !(Number.isInteger(b.seq) && b.seq > 0)
      || !["run", "help", "end"].includes(b.state) || (b.sealed && typeof b.sealed !== "object")) return err("bad request", 400);
    const alerts = [];
    if (!m.run || m.run.id !== b.run) {
      if (m.run) await this.dropBlobs();
      m.run = { id: b.run, started: t, last: t, state: "run", seq: 0, alerts: [], silent: false, ended: null, sent: {},
        pace: { mode: "live" }, boost: null };
      alerts.push({ kind: "start", t });
    }
    const run = m.run;
    run.pace = cleanPace(b.pace);
    if (b.seq <= run.seq) {
      await this.save();
      return Response.json({ ack: run.seq, next: this.next(t), watched: this.looking(t), boost: run.boost || null });
    }
    const puts = {};
    for (const [w, sealed] of Object.entries(b.sealed || {})) {
      if (!m.watchers[w] || typeof sealed !== "string" || !/^[A-Za-z0-9_-]{24,}$/.test(sealed)) continue;
      if (sealed.length > 120000) return err("too large", 413);
      puts[`b:${w}:${pad(b.seq)}`] = sealed;
    }
    if (Object.keys(puts).length) await this.ctx.storage.put(puts);
    run.seq = b.seq;
    run.last = t;
    run.silent = false;
    if (Number.isFinite(b.bat)) run.bat = Math.max(0, Math.min(100, Math.round(b.bat)));
    run.lp = !!b.lp;
    if (b.state === "help") alerts.push({ kind: "help", t });
    for (const k of Array.isArray(b.alerts) ? b.alerts : []) {
      if (!DEVICE_ALERTS.has(k)) continue;
      alerts.push({ kind: k, t });
    }
    if (b.state === "end" && run.state !== "end") {
      run.state = "end";
      run.ended = t;
      alerts.push({ kind: "end", t });
    } else if (run.state !== "end") run.state = b.state === "help" ? "help" : "run";
    run.alerts.push(...alerts);
    if (run.alerts.length > 200) run.alerts = run.alerts.slice(-200);
    m.touched = t;
    await this.save();
    await this.plan();
    return Response.json({ ack: b.seq, next: this.next(t), watched: this.looking(t), boost: run.boost || null,
      notify: this.notifications(alerts) });
  }

  looking(t) { return Object.values(this.m.watchers).filter((x) => x.seen && t - x.seen < LOOKING_S).length; }
  /** Seconds to the next batch: Direct as before; a long run its own `send`, or Direct's while a request for it holds. */
  next(t) {
    const run = this.m.run;
    if (run?.pace?.mode === "long") return run.boost && run.boost.until > t ? WATCHED : run.pace.send;
    return this.looking(t) ? WATCHED : IDLE;
  }

  /** A watcher asks the runner's phone for Direct for `min` minutes (0: the long pace again; « Pace »). */
  async pace(w, x, body, t) {
    const run = this.m.run;
    if (!run || run.state === "end" || run.pace?.mode !== "long" || !run.pace.remote) return err("pace", 409);
    const min = Math.round(Number(body?.min));
    if (!Number.isFinite(min) || min < 0 || min > MAX_BOOST_MIN) return err("bad request", 400);
    if (x.paceAt && t - x.paceAt < PACE_GAP_S) return err("too many", 429);
    const at = Math.max(t, (run.boost?.at || 0) + 1);            // each request its own `at`: the phone applies each once
    run.boost = { until: min ? t + min * 60 : t, at, by: w };
    x.paceAt = t;
    x.seen = t;
    await this.save();
    const notify = this.m.token ? [{ w: "@", push: this.m.token, urgent: true, quiet: true,
      data: { app: "folloz", c: this.m.c, kind: "pace", until: String(run.boost.until), at: String(at), by: w } }] : [];
    return Response.json({ boost: run.boost, notify });
  }

  /** A watcher's read: the run under way and its sealed batches for this watcher. */
  async read(w, x, url, t) {
    const m = this.m;
    if (!x.seen || t - x.seen > 10) { x.seen = t; await this.save(); }
    const run = m.run;
    if (!run) return Response.json({ run: null, blobs: [], alerts: [], next: WATCHED });
    const since = url.searchParams.get("run") === run.id ? Math.max(0, Number(url.searchParams.get("since")) || 0) : 0;
    const blobs = [];
    const list = await this.ctx.storage.list({ prefix: `b:${w}:`, start: `b:${w}:${pad(since + 1)}` });
    for (const [k, v] of list) blobs.push([Number(k.slice(k.lastIndexOf(":") + 1)), v]);
    return Response.json({ run: run.id, state: run.state, started: iso(run.started), last: iso(run.last), bat: run.bat ?? null,
      pace: run.pace || { mode: "live" }, boost: run.boost || null, alerts: run.alerts, blobs, next: WATCHED });
  }

  async alarm() {
    const m = await this.head();
    if (!m) return;
    const t = now();
    if (m.run && m.run.state !== "end") {
      if (!m.run.silent && t - m.run.last >= silentS(m.run)) {
        m.run.silent = true;
        const a = { kind: "silent", t };
        m.run.alerts.push(a);
        await this.save();
        await this.tell(this.notifications([a]));
      }
      if (t - m.run.last >= abandonS(m.run)) { m.run.state = "end"; m.run.ended = t; await this.save(); }
    } else if (m.run && t - m.run.ended >= KEEP_S) {
      await this.dropBlobs();
      m.run = null;
      await this.save();
    } else if (!m.run && t - (m.touched || 0) >= IDLE_CHANNEL_S) {
      await this.ctx.storage.deleteAll();
      this.m = null;
      return;
    }
    await this.plan();
  }

  async tell(notify) {
    if (!notify.length || !this.env.TRACK_RELAY_SECRET || !this.env.SITE_URL) return;
    try {
      await fetch(`${this.env.SITE_URL.replace(/\/+$/, "")}/api/folloz/alert`, { method: "POST",
        headers: { "Content-Type": "application/json", "X-Relay": this.env.TRACK_RELAY_SECRET }, body: JSON.stringify({ notify }) });
    } catch (e) { /* the next silence will try again */ }
  }
}

/** The pace a batch reports (« Pace »); a batch without one is Direct. */
function cleanPace(p) {
  if (!p || typeof p !== "object" || p.mode !== "long") return { mode: "live" };
  const n = (v, lo, hi, d) => { const x = Math.round(Number(v)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; };
  return { mode: "long", fix: n(p.fix, 1, 600, 30), send: n(p.send, 15, 3600, 600), remote: p.remote === true,
    boost: n(p.boost, 0, 4e9, 0), by: /^[a-z2-7]{8}$/.test(String(p.by || "")) ? String(p.by) : "" };
}
/** A run's silence: 3 min in Direct, 3 batches and 2 minutes in a long run. */
const silentS = (run) => (run.pace?.mode === "long" ? 3 * run.pace.send + 120 : SILENT_S);
const abandonS = (run) => (run.pace?.mode === "long" ? LONG_ABANDON_S : ABANDON_S);

function cleanPush(p) {
  if (!p || typeof p !== "object") return null;
  const kind = ["fcm", "apns"].includes(p.kind) ? p.kind : null;
  const token = String(p.token || "").slice(0, 400);
  if (!kind || !/^[A-Za-z0-9:_.-]{20,400}$/.test(token)) return null;
  return { kind, token, env: p.env === "dev" ? "dev" : "prod" };
}
