// Stations exchange what they lack (docs/chrono/design.md): each holds the whole log; on meeting, each says what it has
// of every station (`have`), receives the operations beyond it, then every new operation is passed on. Taking one twice
// changes nothing, so links may be cut and made again at any time, and a hub may sit between stations.
// Two transports: a message link (a WebSocket to the app's hub) and a request to the cloud.

const CHUNK = 400;

/**
 * One end of a message link. `send(obj)` writes to the other end; feed what arrives to `receive(obj)`; call `open()` once
 * the link is up and `close()` when it drops. `ev`: the event both must be on. `onPeer({ station, name })`, `onFault(why)`.
 */
export function link(log, send, { ev, name = "", onPeer = null, onFault = null } = {}) {
  let live = false, muted = false, peer = null;
  const ship = (ops) => { for (let i = 0; i < ops.length; i += CHUNK) send({ t: "ops", ops: ops.slice(i, i + CHUNK) }); };
  const off = log.on((added) => { if (live && !muted && added.length) ship(added); });
  return {
    open() { send({ t: "hello", ev, station: log.station, name, have: log.have() }); },
    receive(m) {
      if (!m || typeof m !== "object") return;
      if (m.t === "hello") {
        if (ev && m.ev && m.ev !== ev) { send({ t: "no", why: "event" }); onFault?.("event"); return; }
        peer = { station: m.station, name: m.name || "" };
        onPeer?.(peer);
        ship(log.since(m.have || {}));
        live = true;
        send({ t: "ready", station: log.station });
      } else if (m.t === "ops" && Array.isArray(m.ops)) {
        muted = true;                                       // what came from this link does not go back through it
        try { log.merge(m.ops); } finally { muted = false; }
      } else if (m.t === "no") onFault?.(m.why || "refused");
    },
    close() { live = false; off(); },
    get live() { return live; },
    get peer() { return peer; },
  };
}

/**
 * One exchange with the cloud. `post(body)` sends `{ station, have, ops }` and resolves to `{ ops, have }`: the operations
 * this station lacked and what the cloud now holds. `mem` keeps what the cloud is known to hold between calls.
 * Returns `{ sent, got, more }` (`more`: call again).
 */
export async function cloudSync(log, post, mem = {}) {
  const mine = log.since(mem.have || {}), batch = mine.slice(0, 1500);
  const res = await post({ station: log.station, have: log.have(), ops: batch });
  if (!res || typeof res !== "object") throw new Error("sync");
  const got = Array.isArray(res.ops) ? log.merge(res.ops).length : 0;
  if (res.have) mem.have = res.have;
  return { sent: batch.length, got, more: mine.length > batch.length || !!res.more };
}

/** The cloud's side of that exchange, over any store of operations: `held` (all ops, any order), returns the answer and what to keep. */
export function answerSync(held, body, limit = 3000) {
  const ids = new Set(held.map((o) => `${o.s}:${o.n}`)), fresh = [];
  for (const o of body.ops || []) {
    if (!o || typeof o.s !== "string" || !Number.isFinite(o.n) || !Number.isFinite(o.t) || typeof o.k !== "string") continue;
    const id = `${o.s}:${o.n}`;
    if (!ids.has(id)) { ids.add(id); fresh.push(o); }
  }
  const have = {};
  for (const o of held.concat(fresh)) if (o.n > (have[o.s] || 0)) have[o.s] = o.n;
  const theirs = body.have || {};
  const lacking = held.filter((o) => o.n > (theirs[o.s] || 0));
  return { fresh, answer: { ops: lacking.slice(0, limit), more: lacking.length > limit, have } };
}
