// Ozimut's live relay (Worker « ocn-live », 2026-10-18): one Durable Object per
// liveresultat competition, awake only while someone watches it. Ozimut reaches it through Durable Object bindings only
// (functions/api/live/*, functions/ws/[comp].js): the Worker has no public address (workers_dev off).
//
// Each phone opens a WebSocket (one request, then nothing but the updates pushed to it) and says which class it is
// looking at. The object reads liveresultat for everyone at once — the last passings every 15 s while runners keep
// coming in (30 s when nothing moves; liveresultat caches its answers 15 s anyway), then only the classes that moved
// and that someone watches, with liveresultat's hash so an unchanged class costs a few bytes — and pushes each
// changed class to the phones watching it. Nobody left: the alarm is not set again and the object sleeps.
// The WebSocket Hibernation API keeps idle connections free; only what changed is written to storage.

import { DurableObject } from "cloudflare:workers";
import { watchRuns } from "../../functions/_lib/ciwatch.js";
import * as mop from "./mop.js";
import * as md from "./meosdjango.js";
import * as ol from "./olive.js";
import * as si from "./sportident.js";
import * as orr from "./oresults.js";

const UA = "Ozimut-live/1.0 (+https://ozimut.com; one reader per competition, relayed to its spectators)";
const ACTIVE_MS = 15000, QUIET_MS = 30000;       // polling interval while passings keep coming / when nothing moves
const RECHECK_MS = 90000;                        // a watched class is re-read at least this often (passings list is short)
const MAX_READS = 30;                            // liveresultat reads per wake-up, at most (subrequest limit: 50)
// the pages' course picker shows each class's finishers (owner, 2026-10-21): the classes nobody watches are read for their
// counts only, a few per wake-up — those just punched first (at most every 30 s), then those never read, then each every
// 15 min — and only the two numbers are kept
const COUNT_READS = 3, COUNT_MOVED_MS = 30000, COUNT_STALE_MS = 900000;
const PASS_KEPT = 30;                            // the last passings kept and sent (the pages add them up over a visit)
// A page may watch the whole race (sub "*", owner 2026-10-22: a club's runners across the courses, everyone still out,
// the punches with their places, the runner search): then every class is read as a watched one, and sent to it. Up to
// ALL_NOW missing classes are read at once when it asks, the others at the next wake-ups.
const ALL = "*", ALL_NOW = 12;

const api = (env) => env.LR_API || "https://liveresultat.orientering.se/api.php";

// Races fed by their organiser through Ozimut (« Organisation › Direct », 2026-10-15): numbers from 900 000 000 (liveresultat's
// are far below), never read from liveresultat. Their object keeps what the organiser's page sends — the classes that
// changed since its last read of the timing software's export — and pushes the changes to the pages watching, as for a
// liveresultat race. The push is internal: only Ozimut reaches it, through its Durable Object binding (path /push, which
// no public route forwards: Ozimut's Function passes on /ws/<number> WebSocket requests only).
const PUSHED_FROM = 900000000;
const isPushed = (comp) => Number(comp) >= PUSHED_FROM;
const MAX_PUT = 100;                             // keys per storage.put (the limit is 128)
const MOP_MAX = 16 * 1024 * 1024;                // a MeOS message, at most (Ozimut's Function checks it too)
// A broadcast tied to a competition (« Organisation › Direct », 2026-10-23) is saved to Ozimut's R2 bucket as
// broadcasts/<number>.json — its competition's key, its name and day, every class in the compact form — at most every
// SNAP_MS while it changes (by the alarm, which an organiser's race uses for nothing else), and at once when the organiser
// asks (/snapshot) or ties it to another competition. The workflow copies the folder and « Résultats » reads it
// (ffco_scraper/prov/sources/broadcast.py): the race's results, split times and start list stay after the race.
const SNAP_MS = 120000, SNAP_PREFIX = "broadcasts/";
// Races held on a MeOSDjango site (2026-10-23, meosdjango.js): numbers from 800 000 000, read from the site's course JSON while
// someone watches — every course at each wake-up (a course gives all its classes), the result passed to `update` as a push
const MD_ACTIVE_MS = 20000, MD_QUIET_MS = 60000, MD_DONE_MS = 300000;   // while punches keep coming / quiet / race over
const MD_PAGE_MS = 300000;                       // the competition's page (its courses) read again at most this often
const MD_MAX = 24;                               // course reads per wake-up, at most
// Races on O'Live (co-live.fr, 2026-10-24, olive.js): numbers from 700 000 000, read from its circuits' pages while someone
// watches — every circuit at each wake-up (OL_MAX at most, the others in turn), then the cards of the runners finished since
// (their splits and their start, OL_CARDS at most, those just finished first), passed to `update` as a push
const OL_ACTIVE_MS = 20000, OL_QUIET_MS = 60000, OL_DONE_MS = 300000;   // runners out / only some to start / all through
const OL_PAGE_MS = 300000;                       // the race's page (its circuits) read again at most this often
const OL_MAX = 24, OL_CARDS = 15;                // circuit pages and cards per wake-up, at most (subrequest limit: 50)
const OL_BULK = 10;
// a relay runner's punches, read when a page asks (O'Live's bloc.php): kept this long, one read a socket this often at most
const PUNCH_MS = 20000, PUNCH_GAP_MS = 1000;                              // cards to read on a circuit from which its split times page is read instead
// SPORTident Center's events (2026-10-24, sportident.js): numbers from 600 000 000 (+ the event's id), the results file read
// again while someone watches, conditionally (its ETag: a 304 costs nothing), the classes passed to `update` as a push; the
// event's file (its guid) is the directory's (/si)
const SI_ACTIVE_MS = 20000, SI_QUIET_MS = 60000, SI_DONE_MS = 300000;   // the file changed in the last 5 min / runners out or to start / all through
const SI_RECENT_MS = 300000;
// OResults' events (2026-11-16, oresults.js): numbers from 500 000 000 (+ the event's id), its data read again while someone
// watches — the changes since the last read first (a few bytes when nothing moved), then the whole event when something did
const OR_ACTIVE_MS = 20000, OR_QUIET_MS = 60000, OR_DONE_MS = 300000;   // something happened in the last 5 min / runners out or to start / all through
const OR_RECENT_MS = 300000;
async function lr(env, params) {
  const r = await fetch(`${api(env)}?${new URLSearchParams(params)}`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`liveresultat ${r.status}`);
  const s = await r.text();
  try { return JSON.parse(s); } catch (e) { return JSON.parse(s.replace(/[\t\r\n]+/g, " ").replace(/\\(?!["\\/bfnrtu])/g, "\\\\")); }
}

// a competition's key as Ozimut names it (« a12345 », « d… », « es… »), or null
const raceOf = (s) => (/^[a-z][a-z0-9-]{1,40}$/.test(String(s || "")) ? String(s) : null);

// a class's finishers and runners (non-starters apart), for the course picker
// a short fingerprint of a text (djb2)
const hashOf = (t) => { let h = 5381; for (let i = 0; i < t.length; i++) h = (h * 33 + t.charCodeAt(i)) | 0; return h >>> 0; };
// (a relay: its teams — through the last leg / not missing)
const countOf = (rows, relay) => (relay ? [relay.teams.filter((t) => t[4] === 0).length, relay.teams.filter((t) => t[4] !== 1 && t[4] !== 11).length]
  : [rows.filter((r) => r[4] === 0 && r[3] != null).length, rows.filter((r) => r[4] !== 1 && r[4] !== 11).length]);

// a class's results, compact: [place, name, club, result, status, timeplus, progress, start, splits]
function compact(k) {
  const codes = (k.splitcontrols || []).map((s) => String(s.code));
  return {
    controls: (k.splitcontrols || []).map((s) => [String(s.code), s.name]),
    rows: (k.results || []).map((r) => [Number(r.place) || null, r.name, r.club || "", r.result === "" || r.result == null ? null : Number(r.result),
      r.status, r.timeplus === "" || r.timeplus == null ? null : Number(r.timeplus), r.progress ?? null, r.start ?? null,
      codes.length ? codes.map((c) => (r.splits?.[c] > 0 ? [r.splits[c], r.splits[`${c}_place`] ?? null, r.splits[`${c}_timeplus`] ?? null] : null)) : null]),
  };
}

export class LiveRace extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.m = null;                              // memory; reloaded from storage after a hibernation
    // the pages' heartbeat, answered without waking the object (no request counted)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async load() {
    if (this.m) return this.m;
    const s = await this.ctx.storage.get(["head", "data"]);
    this.m = s.get("head") || { comp: null, info: null, classes: [], classesHash: "", passHash: "", hashes: {}, read: {}, lastChange: 0, classesAt: 0 };
    // each class under its own key (2026-10-22: one value for every class of a big race outgrew the storage's limit); the
    // former single « data » value is read once and written out class by class at the next save
    const old = s.get("data");
    this.m.data = old || {};
    this.legacy = old ? Object.keys(old) : null;
    for (const [k, v] of await this.ctx.storage.list({ prefix: "c:" })) this.m.data[k.slice(2)] = v;
    this.m.counts ||= {}; this.m.counted ||= {}; this.m.chash ||= {};       // (objects of before the counts)
    if (this.m.pushed) for (const [k, v] of Object.entries(this.m.data)) this.m.counts[k] = countOf(v.rows || [], v.relay);
    return this.m;
  }

  /** The head, and the classes named (those that changed) under their own keys. */
  async save(names = []) {
    const { data, ...head } = this.m;
    const all = [...new Set([...names, ...(this.legacy || [])])].filter((c) => data[c]);
    const puts = [["head", head], ...all.map((c) => [`c:${c}`, data[c]])];
    for (let i = 0; i < puts.length; i += MAX_PUT) await this.ctx.storage.put(Object.fromEntries(puts.slice(i, i + MAX_PUT)));
    if (this.legacy) { this.legacy = null; await this.ctx.storage.delete("data"); }
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch (e) { /* closed meanwhile */ }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/push" && request.method === "POST") return this.push(request, url.searchParams.get("comp") || "");
    if (url.pathname === "/mop" && request.method === "POST") return this.mop(request, url.searchParams.get("comp") || "");
    if (url.pathname === "/snapshot" && request.method === "POST") return this.snapshotNow(url.searchParams.get("comp") || "", url.searchParams);
    if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket expected", { status: 426 });
    const comp = url.pathname.split("/").filter(Boolean).pop();
    if (!/^\d{1,9}$/.test(comp)) return new Response("Bad competition", { status: 400 });
    const m = await this.load();
    m.comp = comp;
    if (md.isMd(comp) || ol.isOl(comp) || si.isSi(comp) || orr.isOr(comp)) {
      // a MeOSDjango, O'Live, SPORTident Center or OResults race: read once when nothing is held, then by the alarm while
      // someone watches
      if (!m.info) {
        try { await (orr.isOr(comp) ? this.readOr(m) : si.isSi(comp) ? this.readSi(m) : ol.isOl(comp) ? this.readOl(m) : this.readMd(m)); } catch (e) {
          return new Response(orr.isOr(comp) ? "OResults unavailable" : si.isSi(comp) ? "SPORTident Center unavailable"
            : ol.isOl(comp) ? "O'Live unavailable" : "MeOSDjango unavailable", { status: 502 });
        }
      }
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      this.send(server, { t: "hello", info: m.info, classes: m.classes, at: m.lastChange, pass: m.pass || null, counts: m.counts });
      if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + MD_ACTIVE_MS);
      return new Response(null, { status: 101, webSocket: client });
    }
    if (isPushed(comp)) {
      // an organiser's race: what they sent so far (perhaps nothing yet), no liveresultat, no alarm
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      this.send(server, { t: "hello", info: m.info || { name: "Diffusion en attente", timezone: "Europe/Paris" }, classes: m.classes,
        at: m.lastChange, pass: m.pass || null, counts: m.counts });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (!m.info) {
      try {
        m.info = await lr(this.env, { method: "getcompetitioninfo", comp });
        await this.readClasses(m);
        await this.readPassings(m);
      } catch (e) {
        return new Response("liveresultat unavailable", { status: 502 });
      }
      await this.save();
    }
    if (!m.pass) {                              // a race relayed before passings were kept: read them once
      m.passHash = "";
      try { if (await this.readPassings(m)) await this.save(); } catch (e) { /* the next wake-up */ }
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    // the last passings come with the hello: a page opened between two arrivals is not left empty
    this.send(server, { t: "hello", info: m.info, classes: m.classes, at: m.lastChange, pass: m.pass || null, counts: m.counts });
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 2000);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let q;
    if (raw === "ping") { try { ws.send("pong"); } catch (e) { /* closed */ } return; }
    try { q = JSON.parse(raw); } catch (e) { return; }
    if (q.punch && typeof q.punch.c === "string" && typeof q.punch.k === "string") return this.punches(ws, q.punch.c, q.punch.k);
    if (typeof q.sub !== "string" || q.sub.length > 200) return;
    ws.serializeAttachment({ sub: q.sub });
    const m = await this.load();
    if (q.sub === ALL) {
      // the whole race: every class held, then the missing ones, read now (a few) or at the next wake-ups
      for (const c of m.classes) if (m.data[c]) this.send(ws, { t: "class", c, ...m.data[c] });
      if (m.pushed) return;
      const read = [];
      for (const c of m.classes.filter((x) => !m.data[x]).slice(0, ALL_NOW)) {
        try { if (await this.readClass(m, c)) { read.push(c); this.send(ws, { t: "class", c, ...m.data[c] }); } } catch (e) { break; }
      }
      if (read.length) { await this.save(read); this.send(ws, { t: "counts", counts: m.counts }); }
      return;
    }
    if (!m.classes.includes(q.sub)) return this.send(ws, { t: "class", c: q.sub, missing: true });
    if (!m.data[q.sub] && !m.pushed) {
      try { if (await this.readClass(m, q.sub)) await this.save([q.sub]); } catch (e) { /* sent at the next wake-up */ }
    }
    if (m.data[q.sub]) this.send(ws, { t: "class", c: q.sub, ...m.data[q.sub] });
  }

  /** An O'Live relay runner's punches (2026-10-25, owner: as O'Live opens them under a runner): the card of the class's runner
   *  `k` (« name|team »), read from O'Live when asked (kept PUNCH_MS; one read a socket every PUNCH_GAP_MS at most). Answers
   *  { t: "punch", c, k, rows: [[code, leg, time, time of day, place, gap]…] } (`none`: no card known). */
  async punches(ws, c, k) {
    const m = await this.load();
    const reply = (x) => this.send(ws, { t: "punch", c, k, ...x });
    if (!ol.isOl(m.comp) || !m.ol?.relay || c.length > 200 || k.length > 400) return reply({ none: true });
    const card = (await this.ctx.storage.get(`olc:${c}`))?.[k];
    if (!card) return reply({ none: true });
    this.pc ||= new Map();
    const hit = this.pc.get(card), now = Date.now();
    if (hit && now - hit.at < PUNCH_MS) return reply({ rows: hit.rows, at: hit.at });
    this.pw ||= new WeakMap();
    if (now - (this.pw.get(ws) || 0) < PUNCH_GAP_MS) return hit ? reply({ rows: hit.rows, at: hit.at }) : reply({ busy: true });
    this.pw.set(ws, now);
    const { host, id } = ol.site(m.comp);
    try {
      const rows = ol.punchList((await ol.get(`${ol.base(host)}/bloc.php`, { Demande: "PointagesPuce", IdCourse: id, NumPuce: card })).text);
      this.pc.set(card, { rows, at: now });
      if (this.pc.size > 500) this.pc.delete(this.pc.keys().next().value);
      reply({ rows, at: now });
    } catch (e) { hit ? reply({ rows: hit.rows, at: hit.at }) : reply({ failed: true }); }
  }

  async webSocketClose(ws, code) {
    try { ws.close(code, "bye"); } catch (e) { /* already closed */ }
  }

  /** An organiser's push (internal, from Ozimut): { info, order: [class names, in the file's order], classes: { name:
   *  { controls, rows } } } — the classes that changed, in liveresultat's compact form; answers what it did. */
  async push(request, comp) {
    if (!/^\d{9}$/.test(comp) || !isPushed(comp)) return new Response("Not an organiser's race", { status: 400 });
    let p;
    try { p = await request.json(); } catch (e) { return new Response("Bad JSON", { status: 400 }); }
    return new Response(JSON.stringify(await this.update(comp, p, { race: raceOf(request.headers.get("X-Race")) })),
      { headers: { "Content-Type": "application/json" } });
  }

  /** MeOS's online results (internal, from Ozimut's /api/live/mop): a <MOPComplete> or <MOPDiff>, perhaps zipped, applied to
   *  the race's MOP state (mop.js), the classes it touched rebuilt in the compact form and passed on as a push; the
   *  broadcast's name, date and organiser come in X-Info. Answers { status: MeOS's word, … }. */
  async mop(request, comp) {
    const out = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (!/^\d{9}$/.test(comp) || !isPushed(comp)) return out({ status: "BADCMP" }, 400);
    let bytes = new Uint8Array(await request.arrayBuffer());
    if (!bytes.length) return out({ status: "NODATA" }, 400);
    if (bytes.length > MOP_MAX) return out({ status: "ERROR", error: "too large" }, 413);
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
      try { bytes = await mop.unzipFirst(bytes); } catch (e) { return out({ status: "NOZIP", error: e.message }, 415); }
    }
    const doc = mop.parseXml(mop.decodeXml(bytes));
    if (!doc || (doc.name !== "MOPComplete" && doc.name !== "MOPDiff")) return out({ status: "BADXML" }, 400);
    const complete = doc.name === "MOPComplete";
    let h = complete ? null : await this.ctx.storage.get("mop:h");
    const fresh = !h;
    h ||= mop.emptyHead();
    const states = new Map();
    const getCls = async (id) => {
      if (!states.has(id)) states.set(id, (!fresh && (await this.ctx.storage.get(`mop:c:${id}`))) || mop.emptyClass());
      return states.get(id);
    };
    const { touched, removed, all, runners } = await mop.apply(doc, h, getCls);
    const ids = all || fresh ? Object.keys(h.cls) : [...touched].filter((id) => h.cls[id]);
    const classes = {};
    for (const id of ids) {
      const k = await getCls(id);
      h.cnt[id] = Object.keys(k.r).length + Object.keys(k.t).length;
    }
    for (const id of removed) { delete h.cnt[id]; delete h.nm[id]; }
    // the names shown: MeOS's, made unique in its order
    const order = mop.classOrder(h), used = new Set();
    for (const id of order) {
      let n = h.cls[id].n || `#${id}`;
      while (used.has(n)) n += " ";
      used.add(n);
      h.nm[id] = n;
    }
    for (const id of ids) if (h.cnt[id] > 0) classes[h.nm[id]] = mop.compactClass(h, id, await getCls(id));
    let info = null;
    try { info = JSON.parse(decodeURIComponent(request.headers.get("X-Info") || "")); } catch (e) { /* MeOS's own then */ }
    info = { name: info?.name || h.comp?.name || "", organizer: info?.organizer || h.comp?.organizer || "", date: info?.date || h.comp?.date || null };
    const r = await this.update(comp, { info, order: order.map((id) => h.nm[id]), classes }, { prune: true, race: raceOf(request.headers.get("X-Race")) });
    // MeOS's state: a complete race starts afresh; the head, then the classes touched under their own keys
    if (complete) {
      const old = [...(await this.ctx.storage.list({ prefix: "mop:" })).keys()];
      for (let i = 0; i < old.length; i += 128) await this.ctx.storage.delete(old.slice(i, i + 128));
    }
    const puts = [["mop:h", h], ...[...states].filter(([id]) => h.cls[id] || h.cnt[id]).map(([id, k]) => [`mop:c:${id}`, k])];
    for (let i = 0; i < puts.length; i += MAX_PUT) await this.ctx.storage.put(Object.fromEntries(puts.slice(i, i + MAX_PUT)));
    if (removed.size) await this.ctx.storage.delete([...removed].map((id) => `mop:c:${id}`));
    return out({ status: "OK", kind: complete ? "complete" : "diff", runners: Object.keys(h.who).length + Object.keys(h.team).length,
      sent: runners, ...r });
  }

  /** The classes that changed, in the compact form (from the organiser's page or from MeOS), stored and pushed to the pages
   *  watching; `prune`: the classes not in `order` are dropped (MeOS sends the whole race's list); `race`: the competition
   *  the broadcast is tied to (null: none; undefined: unknown, as before). */
  async update(comp, p, { prune = false, race } = {}) {
    const m = await this.load();
    const first = !m.pushed;
    m.comp = comp;
    m.pushed = true;
    let raceChanged = false;
    if (race !== undefined && (m.race || null) !== race) { m.race = race; raceChanged = true; }
    const now = Date.now();
    let infoChanged = false;
    if (p.info && typeof p.info === "object") {
      // (a time zone only from a relayed platform that gives one: SPORTident Center's events abroad)
      const tz = typeof p.info.timezone === "string" && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)+$/.test(p.info.timezone) ? p.info.timezone : "Europe/Paris";
      const info = { name: String(p.info.name || "").slice(0, 160), organizer: String(p.info.organizer || "").slice(0, 160),
        date: /^\d{4}-\d\d-\d\d$/.test(p.info.date || "") ? p.info.date : null, timezone: tz, timediff: 0 };
      if (JSON.stringify(info) !== JSON.stringify(m.info)) { m.info = info; infoChanged = true; }
    }
    const changed = [], arrivals = [];
    for (const [name, k] of Object.entries(p.classes && typeof p.classes === "object" ? p.classes : {})) {
      if (!name || name.length > 200 || !k || !Array.isArray(k.rows) || k.rows.length > 5000) continue;
      // (a relay's class: its teams too, `relay`, from O'Live)
      const next = { controls: Array.isArray(k.controls) ? k.controls.slice(0, 200) : [], rows: k.rows,
        ...(k.relay && Array.isArray(k.relay.teams) ? { relay: k.relay } : {}) };
      const prev = m.data[name];
      if (prev && JSON.stringify({ controls: prev.controls, rows: prev.rows, ...(prev.relay ? { relay: prev.relay } : {}) }) === JSON.stringify(next)) continue;
      // the runners who finished, and the radio controls passed, since the last push, for the ticker of punches:
      // [name, class, control code (1000: the finish), its name, time, start]
      const was = new Map((prev?.rows || []).map((r) => [`${r[1]}|${r[2]}`, r]));
      for (const r of next.rows) {
        const o = was.get(`${r[1]}|${r[2]}`);
        // a runner seen for the first time is no news (MeOS sends a whole race in chunks of 64: its first send spans several pushes)
        if (!o) continue;
        const finished = r[4] === 0 && r[3] != null && !(o[4] === 0 && o[3] != null);
        if (finished) arrivals.push([r[1], name, 1000, "", r[3], r[7]]);
        const fresh = (r[8] || []).map((s, i) => (s && !o[8]?.[i] ? i : -1)).filter((i) => i >= 0);
        // a card read at the finish brings every split at once (MeOS's « all punches », a MeOSDjango site): the finish is the news;
        // a card read later (O'Live: a wake-up or more after the finish when many come at once) is no news at all, nor a
        // mispunched or retired runner's
        if (fresh.length > 2 && r[4] != null && r[4] !== 9 && r[4] !== 10 && (r[4] !== 0 || r[3] != null)) continue;
        for (const i of fresh) arrivals.push([r[1], name, next.controls[i]?.[0] ?? i + 1, next.controls[i]?.[1] ?? "", r[8][i][0], r[7]]);
      }
      m.data[name] = { ...next, at: now };
      m.counts[name] = countOf(next.rows, next.relay);
      changed.push(name);
    }
    const order = Array.isArray(p.order) ? p.order.filter((c) => typeof c === "string" && m.data[c]) : null;
    const classes = order && (order.length || prune) ? order : [...new Set([...m.classes, ...changed])];
    const classesChanged = JSON.stringify(classes) !== JSON.stringify(m.classes);
    m.classes = classes;
    const dropped = prune ? Object.keys(m.data).filter((c) => !classes.includes(c)) : [];
    for (const c of dropped) { delete m.data[c]; delete m.counts[c]; }
    // the first push is no news (the file may already hold hours of results): no arrivals then
    if (arrivals.length && !first) {
      const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit",
        hourCycle: "h23" }).format(new Date(now));
      // the time written out, as liveresultat sends it in its passings (« 41:40 », « 1:05:12 »)
      const out = (h) => { const x = Math.floor(h / 100), mm = String(Math.floor(x / 60) % 60).padStart(2, "0"), ss = String(x % 60).padStart(2, "0");
        return x >= 3600 ? `${Math.floor(x / 3600)}:${mm}:${ss}` : `${Math.floor(x / 60)}:${ss}`; };
      // each at its time of day (the start + its time) when the start is known, else now; the latest first
      const tod = (h) => { const x = Math.floor(h / 100) % 86400; return [Math.floor(x / 3600), Math.floor(x / 60) % 60, x % 60].map((v) => String(v).padStart(2, "0")).join(":"); };
      const items = arrivals.map(([n, k, c, cn, t, st]) => [st != null ? tod(st + t) : clock, n, k, c, c === 1000 ? "Arrivée" : cn, out(t), st != null ? st + t : Infinity])
        .sort((a, b) => b[6] - a[6]).slice(0, PASS_KEPT).map((x) => x.slice(0, 6));
      // by time of day, the latest first (split times read at the finish come after later punches)
      m.pass = [...items, ...(m.pass || [])].sort((a, b) => (b[0].padStart(8, "0") > a[0].padStart(8, "0") ? 1 : -1)).slice(0, PASS_KEPT);
      m.lastChange = now;
    }
    const sockets = this.ctx.getWebSockets();
    if (infoChanged || first) for (const ws of sockets) this.send(ws, { t: "hello", info: m.info, classes: m.classes, at: m.lastChange, pass: m.pass || null, counts: m.counts });
    else if (classesChanged) for (const ws of sockets) this.send(ws, { t: "classes", classes: m.classes });
    if (changed.length && !infoChanged && !first) for (const ws of sockets) this.send(ws, { t: "counts", counts: m.counts });
    if (arrivals.length && !first) for (const ws of sockets) this.send(ws, { t: "pass", items: m.pass, at: m.lastChange });
    for (const ws of sockets) {
      const sub = ws.deserializeAttachment()?.sub;
      for (const c of changed) if (sub === c || sub === ALL) this.send(ws, { t: "class", c, ...m.data[c] });
    }
    // a broadcast tied to a competition (or that was): saved for « Résultats » by the alarm, SNAP_MS after its first change
    let snapDue = false;
    if (this.env.BUCKET && (m.race || m.snapped) && (changed.length || dropped.length || infoChanged || raceChanged)) {
      snapDue = !m.dirty;
      m.dirty = true;
    }
    // each changed class under its own key, the head apart
    const { data, ...head } = m;
    const puts = [["head", head], ...changed.map((c) => [`c:${c}`, m.data[c]])];
    for (let i = 0; i < puts.length; i += MAX_PUT) await this.ctx.storage.put(Object.fromEntries(puts.slice(i, i + MAX_PUT)));
    if (dropped.length) await this.ctx.storage.delete(dropped.map((c) => `c:${c}`));
    if (snapDue && !(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(now + SNAP_MS);
    return { ok: true, classes: m.classes.length, changed: changed.length, arrivals: first ? 0 : arrivals.length, viewers: sockets.length };
  }

  /** A MeOSDjango race: its courses read (the competition's page now and then for their list), the classes passed to
   *  `update` as a push (`prune`: the whole race each time). Throws when a read fails: nothing half read is passed on. */
  async readMd(m) {
    const { host, cid } = md.site(m.comp);
    if (!host) throw new Error("unknown MeOSDjango site");
    const base = `https://${host}`;
    m.md ||= { at: 0, courses: [], info: null, state: null, age: null };
    if (!m.md.courses.length || Date.now() - m.md.at >= MD_PAGE_MS) {
      const page = await md.get(`${base}/competition/${cid}/`);
      m.md.courses = md.courses(page, cid);
      m.md.at = Date.now();
      if (!m.md.info) {
        const card = md.cards(await md.get(`${base}/?months=3`)).find((c) => c.cid === cid);
        const title = /<title>([^<]*)<\/title>/i.exec(page)?.[1]?.trim() || "";
        m.md.info = { name: card?.name || title, organizer: card?.organizer || "", date: card?.date || null };
      }
    }
    const list = [];
    for (const h of m.md.courses.slice(0, MD_MAX)) list.push(await md.get(`${base}/api/${cid}/course/${h}/live/`, true));
    m.md.state = list.find((d) => d.race_state)?.race_state || null;
    const ages = list.map(md.lastAge).filter((a) => a != null);
    m.md.age = ages.length ? Math.min(...ages) : null;
    const date = m.md.info.date || list.find((d) => d.competition_date)?.competition_date || null;
    const { order, classes } = md.compact(list);
    return this.update(m.comp, { info: { ...m.md.info, date }, order, classes }, { prune: true });
  }

  /** A SPORTident Center event: its results file read again when it changed (ETag), the classes passed to `update` as a push
   *  (`prune`: the file holds the whole event). The event's file and details come from the directory's list (/si). Throws
   *  when the read fails: nothing half read is passed on. */
  async readSi(m) {
    m.si ||= { ev: null, etag: null, modified: null, out: false, wait: false };
    if (!m.si.ev) {
      const r = await this.env.DIR.get(this.env.DIR.idFromName("directory")).fetch(`https://dir/si?id=${si.eventOf(m.comp)}`);
      if (!r.ok) throw new Error("unknown SPORTident Center event");
      m.si.ev = await r.json();
    }
    const f = await si.results(m.si.ev.guid, m.info ? m.si.etag : null);
    m.si.modified = f.modified ?? m.si.modified;
    if (f.status === 304) return null;
    m.si.etag = f.etag;
    const { order, classes, info } = si.compact(si.decode(f.bytes));
    m.si.out = si.anyOut(classes);
    m.si.wait = si.anyWaiting(classes);
    const ev = m.si.ev;
    return this.update(m.comp, { info: { name: ev.name || info.name, organizer: ev.organizer || "", date: ev.date || info.date,
      timezone: ev.timezone }, order, classes }, { prune: true });
  }

  /** An OResults event: its changes since the last read asked for (nothing moved: a few bytes, nothing passed on), the
   *  whole event read when something did, the classes passed to `update` as a push (`prune`: the data holds the whole
   *  event). Throws when the read fails: nothing half read is passed on. */
  async readOr(m) {
    m.or ||= { last: 0, act: null, out: false, wait: false };
    const id = orr.eventOf(m.comp);
    if (m.info && m.or.last) {
      const d = await orr.changes(id, m.or.last);
      if (d.status === 304 || !d.data || d.data.lastChangeId === m.or.last) return null;
      const a = orr.lastActivity(d.data);
      if (a) m.or.act = Math.max(m.or.act || 0, a);
    }
    const { data } = await orr.changes(id, 0);
    if (!data?.event) throw new Error("unknown OResults event");
    if (data.event.isRelay) throw new Error("OResults relay");
    m.or.last = data.lastChangeId || 0;
    m.or.act = Math.max(m.or.act || 0, orr.lastActivity(data) || 0) || null;
    const { order, classes, info } = orr.compact(data);
    m.or.out = orr.anyOut(classes);
    m.or.wait = orr.anyWaiting(classes);
    const e = data.event;
    return this.update(m.comp, { info: { name: info.name, organizer: String(e.organization?.name || e.organizer || "").trim(),
      date: info.date, timezone: info.timezone }, order, classes }, { prune: true });
  }

  /** An O'Live race: its circuits' pages read (the race's page now and then for their list), then the cards of the runners
   *  finished since (their splits and start), the classes passed to `update` as a push (`prune`: when every circuit was
   *  read). Throws when a page fails: nothing half read is passed on. */
  async readOl(m) {
    const { host, id } = ol.site(m.comp);
    if (!host) throw new Error("unknown O'Live site");
    const base = ol.base(host), page = (q) => `${base}/resultats.php?${q}&IdCourse=${id}`;
    m.ol ||= { at: 0, circuits: [], info: null, ctrls: {}, cats: {}, read: [], next: 0, out: false, wait: false, due: 0 };
    // the race's name, day and type (a relay is read by teams) from the list of races
    if (!m.ol.info || m.ol.relay === undefined) {
      const race = ol.races((await ol.get(`${base}/resultats.php`)).text).find((r) => r.id === id);
      m.ol.relay = ol.isRelay(race);
      if (race) m.ol.info = { name: race.name, organizer: "", date: race.date || null };
    }
    if (m.ol.relay) return this.readOlRelay(m, page);
    if (!m.ol.circuits.length || Date.now() - m.ol.at >= OL_PAGE_MS) {
      const s = (await ol.get(page("Action=ChoixCircuits"))).text;
      m.ol.circuits = ol.circuits(s, id);
      m.ol.at = Date.now();
      if (!m.ol.info) m.ol.info = { name: ol.title(s), organizer: "", date: null };
    }
    // every circuit when they are few, else OL_MAX of them in turn
    const n = m.ol.circuits.length, all = n <= OL_MAX;
    const todo = all ? m.ol.circuits : Array.from({ length: OL_MAX }, (_, k) => m.ol.circuits[(m.ol.next + k) % n]);
    if (!all) m.ol.next = (m.ol.next + OL_MAX) % n;
    const byCircuit = {};
    for (const c of todo) {
      const p = await ol.get(page(`Action=Result&Circuit=${encodeURIComponent(c)}`));
      byCircuit[c] = ol.starts(ol.rows(p.text), p.at);
      for (const r of byCircuit[c]) {
        const a = (m.ol.cats[r.cat || c] ||= []);
        if (!a.includes(c)) a.push(c);
      }
    }
    // what the classes held know of each runner: their start, their splits once their card was read, their state
    const known = {};
    for (const k of Object.values(m.data)) for (const r of k.rows || []) {
      known[`${r[1]}|${r[2]}`] = { start: r[7] != null ? r[7] / 100 : null, times: (r[8] || []).map((x) => (x ? x[0] / 100 : null)),
        was: r[4], prel: r[9] };
    }
    // the cards of the runners through (their card read, or given up) not read yet: those just finished first (their splits
    // then come with their finish), an OK card first on a circuit whose controls are not known yet
    const read = new Set(m.ol.read), rid = (r) => r.bib || ol.keyOf(r);
    const due = [];
    for (const [c, list] of Object.entries(byCircuit)) for (const r of list) {
      const k = known[ol.keyOf(r)];
      // (a card read under another spelling of the name — an entity decoded since, 2026-10-24 — is read again)
      if (!r.card || !ol.final(r) || (read.has(rid(r)) && k)) continue;
      due.push({ c, r, news: !!k && (k.was === 9 || k.was === 10 || !!k.prel), first: !m.ol.ctrls[c] && r.status === 0 });
    }
    due.sort((a, b) => b.news - a.news || b.first - a.first);
    // a circuit with many cards to read (a race joined under way): its split times page instead, one a wake-up
    const per = {};
    for (const d of due) if (!d.news) per[d.c] = (per[d.c] || 0) + 1;
    // (a page O'Live fails to make — 2026-10-24, A1 at Le Bessat: a PHP error on one runner's times — is not asked again:
    // that circuit's cards are read one by one)
    m.ol.broken ||= [];
    const bulk = Object.keys(per).filter((c) => per[c] >= OL_BULK && !m.ol.broken.includes(c)).sort((a, b) => per[b] - per[a])[0];
    if (bulk) {
      const sp = ol.splitPage((await ol.get(page(`Action=Splits&Circuit=${encodeURIComponent(bulk)}`))).text);
      if (!sp.codes.length) m.ol.broken.push(bulk);
      if (!m.ol.ctrls[bulk] && sp.codes.length) m.ol.ctrls[bulk] = sp.codes;
      const byKey = new Map(sp.rows.map((x) => [`${x.name}|${x.code}`, x]));
      for (const d of due) {
        const x = d.c === bulk && JSON.stringify(sp.codes) === JSON.stringify(m.ol.ctrls[bulk]) && byKey.get(`${d.r.name}|${d.r.code}`);
        if (!x) continue;
        known[ol.keyOf(d.r)] = { start: known[ol.keyOf(d.r)]?.start ?? d.r.start, times: x.times };
        read.add(rid(d.r));
        d.done = true;
      }
    }
    let got = 0;
    for (const { c, r } of due.filter((d) => !d.done).slice(0, OL_CARDS)) {
      const k = ol.card((await ol.get(`${base}/bloc.php`, { Demande: "PointagesPuce", IdCourse: id, NumPuce: r.card })).text);
      got++;
      if (!m.ol.ctrls[c] && r.status === 0 && k.codes.length && k.codes.every(Boolean)) m.ol.ctrls[c] = k.codes;
      if (!m.ol.ctrls[c]) continue;                          // (read again once an OK card gives the circuit's controls)
      known[ol.keyOf(r)] = { start: k.start ?? known[ol.keyOf(r)]?.start ?? r.start, times: ol.align(k, m.ol.ctrls[c]) };
      read.add(rid(r));
    }
    m.ol.read = [...read];
    m.ol.due = due.filter((d) => !d.done).length - got;
    const rows = Object.values(byCircuit).flat();
    m.ol.out = rows.some((r) => r.status === 9);
    m.ol.wait = rows.some((r) => r.status === 10);
    const { order, classes } = ol.compact(byCircuit, m.ol.ctrls, known, m.ol.cats);
    return this.update(m.comp, { info: m.ol.info, order: all ? order : null, classes }, { prune: all });
  }

  /** An O'Live relay (2026-10-25): its categories' pages, each a class of teams (`ol.compactRelay`), passed to `update` as a
   *  push; a category where everyone is through read again only every OL_DONE_MS (it is kept meanwhile). Each team's start,
   *  as seen from its runners out, kept in m.ol.t0 (the legs' starts come from it). */
  async readOlRelay(m, page) {
    const { id } = ol.site(m.comp);
    if (!m.ol.rcats?.length || Date.now() - m.ol.at >= OL_PAGE_MS) {
      const s = (await ol.get(page("Action=ChoixCategories"))).text;
      m.ol.rcats = ol.relayCats(s, id);
      m.ol.at = Date.now();
      if (!m.ol.info) m.ol.info = { name: ol.title(s), organizer: "", date: null };
    }
    m.ol.t0 ||= {}; m.ol.rdone ||= {};
    const cats = {}, now = Date.now();
    let out = false, wait = false;
    for (const c of m.ol.rcats.slice(0, OL_MAX)) {
      if (m.data[c.name] && m.ol.rdone[c.name] && now - m.ol.rdone[c.name] < OL_DONE_MS) continue;
      const p = await ol.get(page(`Action=Result&IdCat=${c.id}`));
      const teams = ol.relay(p.text);
      cats[c.name] = { teams, at: p.at };
      const o = ol.relayOut(teams), w = ol.relayWait(teams);
      out ||= o; wait ||= w;
      if (o || w || !teams.length) delete m.ol.rdone[c.name]; else m.ol.rdone[c.name] = now;
    }
    // (a category not read this time: as it was)
    for (const c of m.ol.rcats) if (!cats[c.name]) {
      const t = m.data[c.name]?.relay?.teams || [];
      out ||= t.some((x) => x[4] === 9); wait ||= t.some((x) => x[4] === 10);
    }
    m.ol.out = out; m.ol.wait = wait; m.ol.due = 0;
    const { classes, cards } = ol.compactRelay(cats, m.ol.t0);
    // each leg's card number, under its own key per category and written only when it changed: what a runner's punches are
    // read by (`punches`), never sent to the pages
    m.ol.chash ||= {};
    for (const [cat, own] of Object.entries(cards)) {
      const h = JSON.stringify(own);
      if (m.ol.chash[cat] !== h.length + ":" + hashOf(h)) { m.ol.chash[cat] = h.length + ":" + hashOf(h); await this.ctx.storage.put(`olc:${cat}`, own); }
    }
    return this.update(m.comp, { info: m.ol.info, order: m.ol.rcats.map((c) => c.name), classes }, { prune: true });
  }

  async readClasses(m) {
    const k = await lr(this.env, { method: "getclasses", comp: m.comp, last_hash: m.classesHash });
    m.classesAt = Date.now();
    if (k.status !== "OK") return false;
    m.classesHash = k.hash;
    m.classes = (k.classes || []).map((c) => c.className);
    return true;
  }

  /** Reads the last passings (kept in m.pass for the pages that open later); true when they changed. */
  async readPassings(m) {
    const p = await lr(this.env, { method: "getlastpassings", comp: m.comp, last_hash: m.passHash });
    if (p.status !== "OK") return false;
    if (m.passHash) m.lastChange = Date.now();       // (the first read is no news: passings may be hours old)
    m.passHash = p.hash;
    m.pass = (p.passings || []).slice(0, PASS_KEPT).map((x) => [x.passtime, x.runnerName, x.class, x.control, x.controlName || "", x.time]);
    return true;
  }

  /** Reads one class; true when it changed (and is then in m.data). */
  async readClass(m, name) {
    const k = await lr(this.env, { method: "getclassresults", comp: m.comp, class: name, unformattedTimes: "true", last_hash: m.hashes[name] || "" });
    m.read[name] = Date.now();
    if (k.status !== "OK") return false;
    m.hashes[name] = k.hash;
    m.data[name] = { ...compact(k), at: Date.now() };
    m.counts[name] = countOf(m.data[name].rows, m.data[name].relay);
    return true;
  }

  /** Reads one class for its counts only (nobody watches it); true when they changed. */
  async readCount(m, name) {
    const k = await lr(this.env, { method: "getclassresults", comp: m.comp, class: name, unformattedTimes: "true", last_hash: m.chash[name] || "" });
    m.counted[name] = Date.now();
    if (k.status !== "OK") return false;
    m.chash[name] = k.hash;
    const c = countOf(compact(k).rows), same = JSON.stringify(c) === JSON.stringify(m.counts[name]);
    m.counts[name] = c;
    return !same;
  }

  /** The broadcast as « Résultats » reads it, written to R2 (broadcasts/<number>.json); the head records it. */
  async snapshot(m) {
    if (!this.env.BUCKET || !isPushed(m.comp)) return false;
    const body = { format: 1, id: Number(m.comp), race: m.race || null, info: m.info || null, saved: Date.now(), order: m.classes,
      classes: m.classes.filter((c) => m.data[c]).map((c) => ({ name: c, controls: m.data[c].controls, rows: m.data[c].rows })) };
    await this.env.BUCKET.put(`${SNAP_PREFIX}${m.comp}.json`, JSON.stringify(body), { httpMetadata: { contentType: "application/json" } });
    m.dirty = false;
    m.snapped = body.saved;
    const { data, ...head } = m;
    await this.ctx.storage.put("head", head);
    return true;
  }

  /** Internal, from Ozimut (functions/api/live/broadcasts.js): the broadcast saved now — the organiser asked, or tied it to
   *  a competition (`race`: its key, empty for none). Answers { ok, saved, classes }. */
  async snapshotNow(comp, q) {
    const out = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
    if (!/^\d{9}$/.test(comp) || !isPushed(comp)) return out({ ok: false, error: "not a broadcast" }, 400);
    const m = await this.load();
    m.comp = comp;
    if (q.has("race")) m.race = raceOf(q.get("race"));
    if (!m.race && !m.snapped) return out({ ok: true, saved: false, classes: m.classes.length });
    try { await this.snapshot(m); } catch (e) { return out({ ok: false, error: String(e.message || e) }, 500); }
    return out({ ok: true, saved: true, classes: m.classes.length });
  }

  async alarm() {
    const m = await this.load();
    if (m.pushed && isPushed(m.comp)) {
      // an organiser's race: its pushes carry the news, the alarm only saves it for « Résultats » (a MeOSDjango race, also
      // passed through `update`, is read by the alarm below)
      if (m.dirty) {
        try { await this.snapshot(m); } catch (e) {
          console.error(`race ${m.comp}: snapshot failed: ${e.message || e}`);
          await this.ctx.storage.setAlarm(Date.now() + SNAP_MS);
        }
      }
      return;
    }
    const sockets = this.ctx.getWebSockets();
    if (!sockets.length) return;                 // nobody watching: no more reads until someone comes back
    if (orr.isOr(m.comp)) {
      // an OResults event: its changes asked for, sooner while things keep happening
      try { await this.readOr(m); } catch (e) { console.error(`race ${m.comp}: ${e.message || e}`); }
      const recent = m.or?.act != null && Date.now() - m.or.act < OR_RECENT_MS;
      const wait = recent ? OR_ACTIVE_MS : m.or?.out || m.or?.wait ? OR_QUIET_MS : OR_DONE_MS;
      await this.ctx.storage.setAlarm(Date.now() + wait);
      return;
    }
    if (si.isSi(m.comp)) {
      // a SPORTident Center event: its file read again (a 304 when unchanged), sooner while it keeps changing
      try { await this.readSi(m); } catch (e) { console.error(`race ${m.comp}: ${e.message || e}`); }
      const recent = m.si?.modified != null && Date.now() - m.si.modified < SI_RECENT_MS;
      const wait = recent ? SI_ACTIVE_MS : m.si?.out || m.si?.wait ? SI_QUIET_MS : SI_DONE_MS;
      await this.ctx.storage.setAlarm(Date.now() + wait);
      return;
    }
    if (ol.isOl(m.comp)) {
      // an O'Live race: every circuit read (update sends what changed), sooner while runners are out or cards wait
      try { await this.readOl(m); } catch (e) { console.error(`race ${m.comp}: ${e.message || e}`); }
      const wait = m.ol?.out || m.ol?.due > 0 ? OL_ACTIVE_MS : m.ol?.wait ? OL_QUIET_MS : OL_DONE_MS;
      await this.ctx.storage.setAlarm(Date.now() + wait);
      return;
    }
    if (md.isMd(m.comp)) {
      // a MeOSDjango race: every course read (update sends what changed), sooner while punches keep coming
      try { await this.readMd(m); } catch (e) { console.error(`race ${m.comp}: ${e.message || e}`); }
      const wait = m.md?.state === "finished" ? MD_DONE_MS : m.md?.age != null && m.md.age < 300 ? MD_ACTIVE_MS : MD_QUIET_MS;
      await this.ctx.storage.setAlarm(Date.now() + wait);
      return;
    }
    const watched = new Map();                   // class -> its sockets
    const everyone = [], whole = [];             // whole: the pages watching every class
    for (const ws of sockets) {
      everyone.push(ws);
      const sub = ws.deserializeAttachment()?.sub;
      if (sub === ALL) whole.push(ws);
      else if (sub != null) (watched.get(sub) || watched.set(sub, []).get(sub)).push(ws);
    }
    let reads = 0, counted = false;
    const changed = [];
    try {
      reads++;
      const moved = new Set();
      if (await this.readPassings(m)) {
        for (const x of m.pass) moved.add(x[2]);
        for (const ws of everyone) this.send(ws, { t: "pass", items: m.pass, at: m.lastChange });
      }
      if (Date.now() - m.classesAt > 300000) {
        reads++;
        if (await this.readClasses(m)) for (const ws of everyone) this.send(ws, { t: "classes", classes: m.classes });
      }
      // the classes watched (every one when a page watches the whole race) that moved, were never read or are stale: those
      // just punched first, then those never read, then the oldest
      const due0 = (whole.length ? m.classes : [...watched.keys()].filter((c) => m.classes.includes(c)))
        .filter((c) => moved.has(c) || !m.data[c] || Date.now() - (m.read[c] || 0) >= RECHECK_MS)
        .sort((a, b) => (moved.has(b) - moved.has(a)) || (!!m.data[a] - !!m.data[b]) || (m.read[a] || 0) - (m.read[b] || 0));
      for (const name of due0) {
        if (reads >= MAX_READS) break;
        reads++;
        if (await this.readClass(m, name)) {
          changed.push(name); counted = true;
          for (const ws of [...(watched.get(name) || []), ...whole]) this.send(ws, { t: "class", c: name, ...m.data[name] });
        }
      }
      const now = Date.now();
      const due = (whole.length ? [] : m.classes.filter((c) => !watched.has(c)))
        .map((c) => [c, moved.has(c) ? 0 : m.counts[c] ? 2 : 1, m.counted[c] || 0])
        .filter(([, p, at]) => p === 1 || now - at > (p === 0 ? COUNT_MOVED_MS : COUNT_STALE_MS))
        .sort((a, b) => a[1] - b[1] || a[2] - b[2]).slice(0, COUNT_READS);
      for (const [name] of due) {
        if (reads >= MAX_READS) break;
        reads++;
        if (await this.readCount(m, name)) counted = true;
      }
    } catch (e) {
      // liveresultat slow or down: try again at the next wake-up
      console.error(`race ${m.comp}: ${e.message || e}`);
    }
    if (counted) for (const ws of everyone) this.send(ws, { t: "counts", counts: m.counts });
    // the next wake-up first, whatever happens to the save: a failed save must not stop the pages' updates
    const active = Date.now() - m.lastChange < 120000;
    await this.ctx.storage.setAlarm(Date.now() + (active ? ACTIVE_MS : QUIET_MS));
    try { await this.save(changed); } catch (e) { console.error(`race ${m.comp}: save failed: ${e.message || e}`); }
  }
}

// The Worker itself: /ws/<comp> straight to the race's object (the site reaches it through its own Function, so that
// phones stay on the site's address); /list for the races of the coming and past days, through the directory object.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/ws\/(\d{1,9})$/);
    if (m) return env.LIVE.get(env.LIVE.idFromName(m[1])).fetch(request);
    if (url.pathname === "/list") return env.DIR.get(env.DIR.idFromName("directory")).fetch(request);
    return new Response("Not found", { status: 404 });
  },
  // Every 10 minutes (wrangler.toml [triggers]): a results run GitHub's schedule skipped is started again, day and night
  // (functions/_lib/ciwatch.js; the site does it too from its page views). Needs the secret GH_DISPATCH_TOKEN.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(watchRuns(env).then((mode) => { if (mode) console.log(`ciwatch: started a ${mode} run`); })
      .catch((e) => console.error(`ciwatch: ${e.message || e}`)));
  },
};

// A race's country, from the time zone its organiser declared on liveresultat (« Europe/Paris »); none declared: a
// Swedish race (liveresultat's home, where the field predates). Overseas France counts as France.
const TZ_COUNTRY = {
  "Europe/Paris": "FR", "Indian/Reunion": "FR", "Indian/Mayotte": "FR", "America/Guadeloupe": "FR", "America/Martinique": "FR",
  "America/Cayenne": "FR", "Pacific/Noumea": "FR", "Pacific/Tahiti": "FR", "Europe/Monaco": "MC", "Europe/Andorra": "AD",
  "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI", "Atlantic/Reykjavik": "IS",
  "Europe/Tallinn": "EE", "Europe/Riga": "LV", "Europe/Vilnius": "LT", "Europe/London": "GB", "Europe/Dublin": "IE",
  "Europe/Brussels": "BE", "Europe/Amsterdam": "NL", "Europe/Luxembourg": "LU", "Europe/Berlin": "DE", "Europe/Zurich": "CH",
  "Europe/Vienna": "AT", "Europe/Rome": "IT", "Europe/Madrid": "ES", "Atlantic/Canary": "ES", "Europe/Lisbon": "PT",
  "Atlantic/Madeira": "PT", "Atlantic/Azores": "PT", "Europe/Prague": "CZ", "Europe/Bratislava": "SK", "Europe/Warsaw": "PL",
  "Europe/Budapest": "HU", "Europe/Ljubljana": "SI", "Europe/Zagreb": "HR", "Europe/Belgrade": "RS", "Europe/Sarajevo": "BA",
  "Europe/Podgorica": "ME", "Europe/Skopje": "MK", "Europe/Tirane": "AL", "Europe/Sofia": "BG", "Europe/Bucharest": "RO",
  "Europe/Chisinau": "MD", "Europe/Athens": "GR", "Europe/Istanbul": "TR", "Asia/Istanbul": "TR", "Europe/Kyiv": "UA",
  "Europe/Kiev": "UA", "Europe/Minsk": "BY", "Europe/Moscow": "RU", "Europe/Malta": "MT", "Asia/Nicosia": "CY",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US", "America/Toronto": "CA",
  "America/Vancouver": "CA", "America/Montreal": "CA", "America/Sao_Paulo": "BR", "America/Argentina/Buenos_Aires": "AR",
  "America/Santiago": "CL", "America/Bogota": "CO", "America/Mexico_City": "MX", "Asia/Tokyo": "JP", "Asia/Shanghai": "CN",
  "Asia/Hong_Kong": "HK", "Asia/Seoul": "KR", "Asia/Singapore": "SG", "Asia/Kolkata": "IN", "Asia/Jerusalem": "IL",
  "Africa/Johannesburg": "ZA", "Pacific/Auckland": "NZ",
};
const countryOf = (tz) => (!tz ? "SE" : TZ_COUNTRY[tz] || (tz.startsWith("Australia/") ? "AU" : "?"));
const LIST_MS = 240000;                 // liveresultat's list read at most this often
const TZ_VERSION = 2;
const MAX_INFO = 14;                    // races looked up per call (subrequest limit: 50, MD_LIST, OL_LIST, SI_LIST and OR_LIST too); the rest next call
// which races are live now (owner, 2026-10-22: « identify clearly which competitions are truly live »): each race of its own
// today has its last passings read (with liveresultat's hash: an unchanged list costs a few bytes), at most every PROBE_MS
// and MAX_PROBE a call, only when the list is asked for; a race is live while its last punch is under LIVE_S old
const PROBE_MS = 180000, MAX_PROBE = 15, LIVE_S = 1800;
// the MeOSDjango sites' races (meosdjango.js): each site's list at most every LIST_MS, today's races probed for their last
// punch (the competition's page now and then, then a few courses a call in turn), MD_LIST requests a call at most
const MD_LIST = 8, MD_PROBE_COURSES = 3, MD_HASHES_MS = 1800000;
// O'Live's races (olive.js): its list at most every LIST_MS, today's races probed in turn, OL_PROBE circuits a call, a race's
// age the time since someone was seen out on it (« Run. ») with a running time that moved since that page's last look (frozen:
// O'Live has stopped counting, the race is over); OL_LIST requests a call at most
const OL_LIST = 4, OL_PROBE = 2;
// SPORTident Center's events (sportident.js): its list (every country) at most every LIST_MS, today's events probed in turn
// (a HEAD of the results file: the age is the time since it last changed); SI_LIST requests a call at most
const SI_LIST = 4;
// OResults' events (oresults.js): its list (every country) at most every OR_LIST_MS, today's events probed in turn (their
// changes since the last probe: the age is the time since the latest finish or punch); OR_LIST requests a call at most
const OR_LIST = 3, OR_LIST_MS = 600000;
// two names of one race: the same words, accents and punctuation aside, or one's words all in the other's
const nameWords = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
function sameName(a, b) {
  const x = nameWords(a), y = nameWords(b);
  if (!x.length || !y.length) return false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.every((w) => long.includes(w)) && short.length >= Math.min(2, long.length);
}
// a time of day now in a race's time zone (else liveresultat's offset from Swedish time), in seconds
function localSeconds(tz, timediff) {
  const at = (zone) => {
    const p = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const v = (k) => p.find((x) => x.type === k)?.value;
    return { s: Number(v("hour")) * 3600 + Number(v("minute")) * 60 + Number(v("second")), day: `${v("year")}-${v("month")}-${v("day")}` };
  };
  try { if (tz) return at(tz); } catch (e) { /* an unknown zone */ }
  const x = at("Europe/Stockholm");
  return { s: (x.s + (timediff || 0) * 3600 + 86400) % 86400, day: x.day };
}

/** The races of the last 3 and next 7 days with their country: liveresultat's whole list (~1 MB, read with a regular
 *  expression: some names hold unescaped quotes that break it as JSON), each new race's time zone read once and kept. */
export class Directory extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/broadcasts") return this.broadcasts(request);
    if (url.pathname === "/si") return this.siEvent(url.searchParams.get("id"));
    // liveresultat's list, read at most every LIST_MS; an answer without it (overloaded: « Connect failed: Too many
    // connections », sent with a 200) changes nothing — the last good list is served meanwhile, never an empty one
    const now = Date.now();
    let last = await this.ctx.storage.get("last");
    let pending = false;
    if (!last || now - last.at >= LIST_MS) {
      let s = "";
      try {
        const r = await fetch(`${api(this.env)}?method=getcompetitions`, { headers: { "User-Agent": UA } });
        s = r.ok ? await r.text() : "";
      } catch (e) { /* liveresultat unreachable */ }
      if (s.includes('"competitions"')) {
        const day = (d) => new Date(Date.now() + d * 86400e3).toISOString().slice(0, 10);
        const lo = day(-3), hi = day(7), out = [];
        for (const x of s.matchAll(/"id": *(\d+), *"name": *"(.*?)", *"organizer": *"(.*?)", *"date": *"(\d{4}-\d\d-\d\d)", *"timediff": *(-?\d+)/g)) {
          if (x[4] >= lo && x[4] <= hi) out.push([Number(x[1]), x[2], x[3], x[4], Number(x[5])]);
        }
        // each race's time zone, asked once — kept only from a real answer (an error text is no time zone: it would
        // make a French race Swedish); TZ_VERSION 2 (2026-10-11) forgets those recorded during an overload
        let known = (await this.ctx.storage.get("tz")) || {};
        if ((await this.ctx.storage.get("tzv")) !== TZ_VERSION) {
          known = {};
          await this.ctx.storage.put("tzv", TZ_VERSION);
        }
        let asked = 0, added = false;
        for (const c of out) {
          if (!(c[0] in known) && asked < MAX_INFO) {
            asked++;
            try {
              const i = await (await fetch(`${api(this.env)}?method=getcompetitioninfo&comp=${c[0]}`, { headers: { "User-Agent": UA } })).text();
              if (/"id"\s*:/.test(i)) {
                known[c[0]] = i.match(/"timezone"\s*:\s*"([^"]*)"/)?.[1] ?? "";
                added = true;
              }
            } catch (e) { /* next time */ }
          }
          c.push(c[0] in known ? countryOf(known[c[0]]) : "?");
        }
        pending = out.some((c) => !(c[0] in known));
        // the races of their own today: their last punch, read now for the oldest checked (each at most every PROBE_MS)
        const probes = (await this.ctx.storage.get("probes")) || {};
        const today = out.filter((c) => c[3] === localSeconds(known[c[0]], c[4]).day);
        const due = today.filter((c) => now - (probes[c[0]]?.checked || 0) >= PROBE_MS)
          .sort((a, b) => (probes[a[0]]?.checked || 0) - (probes[b[0]]?.checked || 0)).slice(0, MAX_PROBE);
        for (const c of due) {
          const p = probes[c[0]] || {};
          try {
            const r = await (await fetch(`${api(this.env)}?method=getlastpassings&comp=${c[0]}&last_hash=${encodeURIComponent(p.hash || "")}`,
              { headers: { "User-Agent": UA } })).json();
            if (r.status === "OK") { p.hash = r.hash; p.last = r.passings?.[0]?.passtime || null; }
            if (r.status === "OK" || r.status === "NOT MODIFIED") p.checked = now;
          } catch (e) { /* next time */ }
          probes[c[0]] = p;
        }
        // the age of each race's last punch, in seconds (null: none known, or another day)
        for (const c of out) {
          const p = probes[c[0]], m = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(p?.last || "");
          let age = null;
          if (m && today.includes(c)) {
            age = localSeconds(known[c[0]], c[4]).s - (Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
            if (age < -300) age = null;                 // (a clock off, or yesterday's punches)
          }
          c.push(age);
        }
        // the record keeps today's races only
        await this.ctx.storage.put("probes", Object.fromEntries(today.filter((c) => probes[c[0]]).map((c) => [c[0], probes[c[0]]])));
        if (added) {
          // only the window's races are kept, so the record stays small
          await this.ctx.storage.put("tz", Object.fromEntries(out.filter((c) => c[0] in known).map((c) => [c[0], known[c[0]]])));
        }
        out.sort((a, b) => b[3].localeCompare(a[3]) || a[1].localeCompare(b[1]));
        // (races still without a country: read again soon)
        // (races still without a country: read again soon; while some race is live, every PROBE_MS)
        const anyLive = out.some((c) => c[6] != null && c[6] <= LIVE_S);
        last = { at: pending ? now - LIST_MS + 30000 : anyLive ? now - LIST_MS + PROBE_MS : now, comps: out, liveS: LIVE_S };
        await this.ctx.storage.put("last", last);
      } else {
        console.error(`directory: no list from liveresultat (${s.slice(0, 60)})`);
        pending = true;
      }
    }
    let mdComps = [];
    try { mdComps = await this.mdComps(now); } catch (e) { console.error(`directory: MeOSDjango: ${e.message || e}`); }
    try { mdComps.push(...await this.olComps(now)); } catch (e) { console.error(`directory: O'Live: ${e.message || e}`); }
    try { mdComps.push(...await this.siComps(now)); } catch (e) { console.error(`directory: SPORTident: ${e.message || e}`); }
    try { mdComps.push(...await this.orComps(now)); } catch (e) { console.error(`directory: OResults: ${e.message || e}`); }
    // a race on both (2026-10-23: OE 42 opened « Pélussin City Race » on liveresultat, never fed it, and ran its live on its
    // MeOSDjango site — listed twice, one empty): one entry, the MeOSDjango (or O'Live) one unless only liveresultat's has punches
    const twin = (c) => mdComps.find((m) => m[3] === c[3] && sameName(m[1], c[1]));
    const lr = (last?.comps || []).filter((c) => { const m = twin(c); return !m || (c[6] != null && m[6] == null); });
    const md2 = mdComps.filter((m) => !lr.some((c) => c[3] === m[3] && sameName(m[1], c[1])));
    const comps = [...lr, ...md2].sort((a, b) => b[3].localeCompare(a[3]) || a[1].localeCompare(b[1]));
    return new Response(JSON.stringify({ at: last?.at || now, comps, liveS: LIVE_S }), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${pending || !last ? 30 : 120}` },
    });
  }

  /** The MeOSDjango sites' races of the last 3 and next 7 days, in the list's form [id, name, organiser, date, 0, "FR", age, host]:
   *  each site's cards at most every LIST_MS (kept when a site does not answer), today's races' last punch (seconds) read a
   *  few courses a call in turn, at most every PROBE_MS a race. */
  async mdComps(now) {
    const s = (await this.ctx.storage.get("md")) || { at: 0, comps: [], probes: {} };
    let budget = MD_LIST, changed = false;
    if (now - s.at >= LIST_MS) {
      const day = (d) => new Date(now + d * 86400e3).toISOString().slice(0, 10);
      const lo = day(-3), hi = day(7), out = [];
      for (const [i, host] of md.HOSTS.entries()) {
        let cards = null;
        if (budget > 0) { budget--; try { cards = md.cards(await md.get(`https://${host}/?months=3`)); } catch (e) { /* kept below */ } }
        if (cards) out.push(...cards.filter((c) => c.date >= lo && c.date <= hi).map((c) => [md.raceId(i, c.cid), c.name, c.organizer, c.date, 0, "FR", null]));
        else out.push(...s.comps.filter((c) => md.site(c[0]).host === host));
      }
      s.comps = out; s.at = now; changed = true;
    }
    const today = localSeconds("Europe/Paris", 0).day;
    const races = s.comps.filter((c) => c[3] === today);
    s.probes = Object.fromEntries(races.filter((c) => s.probes[c[0]]).map((c) => [c[0], s.probes[c[0]]]));
    for (const c of races.sort((a, b) => (s.probes[a[0]]?.checked || 0) - (s.probes[b[0]]?.checked || 0))) {
      const p = s.probes[c[0]] ||= { hashes: [], hashesAt: 0, next: 0, ages: {}, checked: 0 };
      if (budget <= 0 || now - p.checked < PROBE_MS) continue;
      const { host, cid } = md.site(c[0]), base = `https://${host}`;
      try {
        if (!p.hashes.length || now - p.hashesAt >= MD_HASHES_MS) {
          budget--;
          p.hashes = md.courses(await md.get(`${base}/competition/${cid}/`), cid);
          p.hashesAt = now;
        }
        for (let k = 0; k < Math.min(MD_PROBE_COURSES, p.hashes.length) && budget > 0; k++) {
          const h = p.hashes[p.next++ % p.hashes.length];
          budget--;
          const a = md.lastAge(await md.get(`${base}/api/${cid}/course/${h}/live/`, true));
          p.ages[h] = a == null ? null : [a, now];
        }
        p.checked = now;
      } catch (e) { /* next time */ }
      changed = true;
    }
    if (changed) await this.ctx.storage.put("md", s);
    // the age of each race's last punch now: its courses' youngest, carried forward since read
    return s.comps.map((c) => {
      const ages = Object.values(s.probes[c[0]]?.ages || {}).filter(Boolean).map(([a, at]) => a + Math.round((now - at) / 1000));
      // (the site's address last: the page names it beside the organiser)
      return [...c.slice(0, 6), c[3] === today && ages.length ? Math.min(...ages) : null, md.site(c[0]).host];
    });
  }

  /** O'Live's races of the last 3 and next 7 days (relays too, since 2026-10-25), in the list's form [id, name,
   *  "", date, 0, "FR", age, host]: each site's list at most every LIST_MS (kept when a site does not answer), today's
   *  races probed a few circuits a call in turn, at most every PROBE_MS a race; the age is the time since someone was seen
   *  out on the race. */
  async olComps(now) {
    const s = (await this.ctx.storage.get("ol")) || { at: 0, comps: [], probes: {} };
    let budget = OL_LIST, changed = false;
    if (now - s.at >= LIST_MS) {
      const day = (d) => new Date(now + d * 86400e3).toISOString().slice(0, 10);
      const lo = day(-3), hi = day(7), out = [];
      for (const [i, host] of ol.HOSTS.entries()) {
        let list = null;
        if (budget > 0) { budget--; try { list = ol.races((await ol.get(`${ol.base(host)}/resultats.php`)).text); } catch (e) { /* kept below */ } }
        // (a relay's flag kept after the list's fields: its probe reads its categories)
        if (list) out.push(...list.filter((r) => r.date && r.date >= lo && r.date <= hi).map((r) => [ol.raceId(i, r.id), r.name, "", r.date, 0, "FR", null, ol.isRelay(r)]));
        else out.push(...s.comps.filter((c) => ol.site(c[0]).host === host));
      }
      s.comps = out; s.at = now; changed = true;
    }
    const today = localSeconds("Europe/Paris", 0).day;
    const races = s.comps.filter((c) => c[3] === today);
    s.probes = Object.fromEntries(races.filter((c) => s.probes[c[0]]).map((c) => [c[0], s.probes[c[0]]]));
    for (const c of races.sort((a, b) => (s.probes[a[0]]?.checked || 0) - (s.probes[b[0]]?.checked || 0))) {
      // (a probe of before 2026-10-25, which counted a frozen « Run. » or a finished mass start « Ant » as out: afresh)
      if (s.probes[c[0]]?.v !== 2) s.probes[c[0]] = { v: 2, circuits: [], circuitsAt: 0, next: 0, out: 0, checked: 0, sig: {} };
      const p = s.probes[c[0]];
      if (budget <= 0 || now - p.checked < PROBE_MS) continue;
      const { host, id } = ol.site(c[0]), page = (q) => `${ol.base(host)}/resultats.php?${q}&IdCourse=${id}`;
      try {
        // (a relay: its categories, each read as a page of teams)
        const relay = !!c[7];
        if (!p.circuits.length || now - p.circuitsAt >= MD_HASHES_MS) {
          budget--;
          p.circuits = relay ? ol.relayCats((await ol.get(page("Action=ChoixCategories"))).text, id).map((x) => x.id)
            : ol.circuits((await ol.get(page("Action=ChoixCircuits"))).text, id);
          p.circuitsAt = now;
        }
        for (let k = 0; k < Math.min(OL_PROBE, p.circuits.length) && budget > 0; k++) {
          const ci = p.circuits[p.next++ % p.circuits.length];
          budget--;
          const t = (await ol.get(page(relay ? `Action=Result&IdCat=${ci}` : `Action=Result&Circuit=${encodeURIComponent(ci)}`))).text;
          const s1 = relay ? ol.relayOutSig(ol.relay(t)) : ol.outSig(ol.rows(t)), sig = s1 ? s1.length + ":" + hashOf(s1) : "";
          if (sig && sig !== p.sig[ci]) p.out = now;
          p.sig[ci] = sig;
        }
        p.checked = now;
      } catch (e) { /* next time */ }
      changed = true;
    }
    if (changed) await this.ctx.storage.put("ol", s);
    return s.comps.map((c) => {
      const p = s.probes[c[0]];
      return [...c.slice(0, 6), c[3] === today && p?.out ? Math.round((now - p.out) / 1000) : null, ol.site(c[0]).host];
    });
  }

  /** SPORTident Center's orienteering events of the last 3 and next 7 days, every country, in the list's form [id, name,
   *  organiser, date, 0, country, age, host]: the list at most every LIST_MS (kept when the Center does not answer), each
   *  event's file and time zone kept for its race's object (/si), today's events (in their own time zone) probed in turn, at
   *  most every PROBE_MS an event; the age is the time since the results file last changed. */
  async siComps(now) {
    const s = (await this.ctx.storage.get("si")) || { at: 0, events: [], probes: {} };
    let budget = SI_LIST, changed = false;
    if (now - s.at >= LIST_MS) {
      const day = (d) => new Date(now + d * 86400e3).toISOString().slice(0, 10);
      budget--;
      try { s.events = await si.events(day(-3), day(7)); } catch (e) { /* the last list kept */ }
      s.at = now; changed = true;
    }
    const today = (e) => e.date === localSeconds(e.timezone, 0).day;
    s.probes = Object.fromEntries(s.events.filter((e) => today(e) && s.probes[e.id]).map((e) => [e.id, s.probes[e.id]]));
    for (const e of s.events.filter(today).sort((a, b) => (s.probes[a.id]?.checked || 0) - (s.probes[b.id]?.checked || 0))) {
      const p = s.probes[e.id] ||= { checked: 0, modified: null };
      if (budget <= 0 || now - p.checked < PROBE_MS) continue;
      budget--;
      try { p.modified = await si.lastChange(e.guid); p.checked = now; } catch (e2) { /* next time */ }
      changed = true;
    }
    if (changed) await this.ctx.storage.put("si", s);
    return s.events.map((e) => {
      const p = s.probes[e.id];
      return [si.raceId(e.id), e.name, e.organizer, e.date, 0, e.country || "?",
        today(e) && p?.modified ? Math.max(0, Math.round((now - p.modified) / 1000)) : null, si.HOST];
    });
  }

  /** OResults' individual events of the last 3 and next 7 days, every country, in the list's form [id, name, organiser,
   *  date, 0, country, age, host]: the list at most every OR_LIST_MS (kept when OResults does not answer), today's events
   *  (in their own time zone) probed in turn, at most every PROBE_MS an event — the whole event the first time, then its
   *  changes since —; the age is the time since its latest finish or punch. */
  async orComps(now) {
    const s = (await this.ctx.storage.get("or")) || { at: 0, events: [], probes: {} };
    let budget = OR_LIST, changed = false;
    if (now - s.at >= OR_LIST_MS) {
      const day = (d) => new Date(now + d * 86400e3).toISOString().slice(0, 10);
      budget--;
      try { s.events = await orr.events(day(-3), day(7)); } catch (e) { /* the last list kept */ }
      s.at = now; changed = true;
    }
    const today = (e) => e.date === localSeconds(e.timezone, 0).day;
    s.probes = Object.fromEntries(s.events.filter((e) => today(e) && s.probes[e.id]).map((e) => [e.id, s.probes[e.id]]));
    for (const e of s.events.filter(today).sort((a, b) => (s.probes[a.id]?.checked || 0) - (s.probes[b.id]?.checked || 0))) {
      const p = s.probes[e.id] ||= { checked: 0, last: 0, act: null };
      if (budget <= 0 || now - p.checked < PROBE_MS) continue;
      budget--;
      try {
        const d = await orr.changes(e.id, p.last || 0);
        if (d.data) {
          const a = orr.lastActivity(d.data);
          if (a) p.act = Math.max(p.act || 0, a);
          p.last = d.data.lastChangeId || p.last;
        }
        p.checked = now;
      } catch (e2) { /* next time */ }
      changed = true;
    }
    if (changed) await this.ctx.storage.put("or", s);
    return s.events.map((e) => {
      const p = s.probes[e.id];
      return [orr.raceId(e.id), e.name, e.organizer, e.date, 0, e.country || "?",
        today(e) && p?.act ? Math.max(0, Math.round((now - p.act) / 1000)) : null, orr.HOST];
    });
  }

  /** One SPORTident Center event of the list, for its race's object: { id, name, organizer, date, country, timezone, guid }. */
  async siEvent(id) {
    const s = (await this.ctx.storage.get("si")) || { events: [] };
    const e = s.events.find((x) => String(x.id) === String(id));
    return e ? new Response(JSON.stringify(e), { headers: { "Content-Type": "application/json" } }) : new Response("Not found", { status: 404 });
  }

  /** The organisers' broadcasts (internal, from Ozimut): GET lists them, the newest first; POST { op: "new", name, date,
   *  organizer, key, mop, by, race } opens one and answers its number; POST { op: "link", id, race, name, date, organizer }
   *  ties it to a competition (race: its key, null for none); POST { op: "mop", id, mop } sets its MeOS password (MeOS's
   *  online results, /api/live/mop); POST { op: "touch", id, via, runners } records a push (via "mop": MeOS's, with the
   *  number of runners it holds). */
  async broadcasts(request) {
    const all = (await this.ctx.storage.get("broadcasts")) || [];
    const out = (body) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
    if (request.method !== "POST") return out({ broadcasts: all });
    let b;
    try { b = await request.json(); } catch (e) { return new Response("Bad JSON", { status: 400 }); }
    if (b.op === "new") {
      const id = (await this.ctx.storage.get("bnext")) || PUSHED_FROM;
      all.unshift({ id, name: String(b.name || "").slice(0, 160), date: b.date || null, organizer: String(b.organizer || "").slice(0, 160),
        key: b.key ? String(b.key).slice(0, 40) : null, mop: b.mop ? String(b.mop).slice(0, 64) : null, by: b.by ?? null,
        race: raceOf(b.race), created: Date.now(), last: null });
      await this.ctx.storage.put({ bnext: id + 1, broadcasts: all.slice(0, 200) });
      return out({ id });
    }
    if (b.op === "link") {
      // the competition the broadcast is tied to (null: none), with its name, day and organiser as the competition gives them
      const x = all.find((y) => y.id === Number(b.id));
      if (x) {
        x.race = raceOf(b.race);
        for (const k of ["name", "organizer"]) if (b[k]) x[k] = String(b[k]).slice(0, 160);
        if (/^\d{4}-\d\d-\d\d$/.test(b.date || "")) x.date = b.date;
        await this.ctx.storage.put("broadcasts", all);
      }
      return out({ ok: !!x });
    }
    if (b.op === "mop") {
      const x = all.find((y) => y.id === Number(b.id));
      if (x) { x.mop = b.mop ? String(b.mop).slice(0, 64) : null; await this.ctx.storage.put("broadcasts", all); }
      return out({ ok: !!x });
    }
    if (b.op === "touch") {
      const x = all.find((y) => y.id === Number(b.id));
      if (x) {
        x.last = Date.now();
        if (b.via === "mop") { x.mopAt = x.last; x.mopRunners = Number(b.runners) || 0; }
        await this.ctx.storage.put("broadcasts", all);
      }
      return out({ ok: !!x });
    }
    return new Response("Bad operation", { status: 400 });
  }
}
