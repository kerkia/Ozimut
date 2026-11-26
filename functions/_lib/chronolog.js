// An event's Chrono log in R2 (Chronoz's cloud copy: functions/api/chrono/[[path]].js; github.com/kerkia/Chronoz
// docs/design.md): `chrono/<event>/meta.json` (what is held of each station, the batches) and `chrono/<event>/b/<key>.json`
// (batches of operations, appended as they come). Shared by the API (a station's sync) and the server station `ozimut`
// (_lib/entrychrono.js: the entries written to the log, the desk's operations read back), which appends and reads here
// without going through HTTP.

const READS = 30, SMALL = 250;

const metaKey = (ev) => `chrono/${ev}/meta.json`;
export async function readMeta(env, ev) {
  const o = await env.BUCKET.get(metaKey(ev));
  if (!o) return { meta: { have: {}, batches: [], n: 0 }, etag: null };
  return { meta: await o.json(), etag: o.etag };
}
export async function writeMeta(env, ev, meta, etag) {
  const body = JSON.stringify({ ...meta, updated: Date.now() });
  // only if nobody wrote meanwhile: a station's sync and another's may arrive together
  const r = await env.BUCKET.put(metaKey(ev), body, { httpMetadata: { contentType: "application/json" }, onlyIf: etag ? { etagMatches: etag } : { etagDoesNotMatch: "*" } });
  return !!r;
}
export const okOp = (o) => o && typeof o === "object" && typeof o.s === "string" && /^[\w-]{1,40}$/.test(o.s) && Number.isInteger(o.n) && o.n > 0 && Number.isFinite(o.t) && typeof o.k === "string" && o.k.length <= 12;

/**
 * `fresh` (operations in each station's sequence after what `meta` holds) stored as a batch and the meta written, if nobody
 * wrote meanwhile. -> { batches, made } or null (to try again).
 */
async function store(env, ev, meta, etag, fresh, by) {
  let batches = meta.batches, drop = null;
  const have = { ...meta.have };
  for (const o of fresh) if (o.n > (have[o.s] || 0)) have[o.s] = o.n;
  const last = batches[batches.length - 1];
  let all = fresh;
  if (last && last.n < SMALL) {                         // a small last batch is rewritten with the new operations, under a new key
    const o = await env.BUCKET.get(`chrono/${ev}/b/${last.k}.json`);
    if (o) { all = (await o.json()).concat(fresh); drop = last.k; batches = batches.slice(0, -1); }
  }
  const r = {};
  for (const o of all) { const x = r[o.s] || (r[o.s] = [o.n, o.n]); if (o.n < x[0]) x[0] = o.n; if (o.n > x[1]) x[1] = o.n; }
  const made = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  await env.BUCKET.put(`chrono/${ev}/b/${made}.json`, JSON.stringify(all), { httpMetadata: { contentType: "application/json" } });
  batches = batches.concat([{ k: made, n: all.length, r }]);
  const next = { ...meta, have, batches, n: (meta.n || 0) + fresh.length, owner: meta.owner || by || null };
  if (!(await writeMeta(env, ev, next, etag))) { await env.BUCKET.delete(`chrono/${ev}/b/${made}.json`); return null; }
  if (drop) await env.BUCKET.delete(`chrono/${ev}/b/${drop}.json`);
  return { batches, made, have };
}

/**
 * A station's exchange (POST …/sync): `body` { station, have: { station: n }, ops } -> { ops (what the caller lacks), have,
 * more, stored (how many of its operations were taken) } or null when the meta stayed busy.
 */
export async function sync(env, ev, body, by) {
  const ops = Array.isArray(body?.ops) ? body.ops.filter(okOp).slice(0, 2000) : [];
  const theirs = body?.have && typeof body.have === "object" ? body.have : {};
  for (let attempt = 0; attempt < 4; attempt++) {
    const { meta, etag } = await readMeta(env, ev);
    // taken: each station's operations in sequence, nothing beyond a gap (it will come again once the gap is filled)
    const have = { ...meta.have }, fresh = [];
    for (const o of [...ops].sort((a, b) => (a.s < b.s ? -1 : a.s > b.s ? 1 : a.n - b.n))) if (o.n === (have[o.s] || 0) + 1) { have[o.s] = o.n; fresh.push(o); }
    let batches = meta.batches, made = null;
    if (fresh.length) {
      const got = await store(env, ev, meta, etag, fresh, by);
      if (!got) continue;
      batches = got.batches; made = got.made;
    }
    // given back: what the caller lacks, a few batches a call
    const need = batches.filter((b) => Object.entries(b.r).some(([s, [, max]]) => max > (theirs[s] || 0)) && b.k !== made);
    const give = [];
    for (const b of need.slice(0, READS)) {
      const o = await env.BUCKET.get(`chrono/${ev}/b/${b.k}.json`);
      if (o) for (const op of await o.json()) if (op.n > (theirs[op.s] || 0)) give.push(op);
    }
    return { ops: give, have, more: need.length > READS, stored: fresh.length };
  }
  return null;
}

/**
 * A server station's operations appended to the log: `items` [{ k, …fields }] numbered after what the log holds of `station`
 * (or `from`, when higher: a sequence kept elsewhere), on a hybrid clock never below `t0`. -> { ops, have } or null when busy.
 */
export async function append(env, ev, station, items, { by = "", from = 0, t0 = 0 } = {}) {
  if (!items.length) return { ops: [], have: null };
  for (let attempt = 0; attempt < 5; attempt++) {
    const { meta, etag } = await readMeta(env, ev);
    const n0 = Math.max(meta.have?.[station] || 0, from);
    const t = Math.max(Date.now() * 1000, t0 + 1);
    const ops = items.map((x, i) => ({ s: station, n: n0 + 1 + i, t: t + i, by, ...x }));
    const got = await store(env, ev, meta, etag, ops, null);
    if (got) return { ops, have: got.have };
  }
  return null;
}

/** Does the event have a log? (its meta, with some operations) */
export async function hasLog(env, ev) {
  const { meta } = await readMeta(env, ev);
  return (meta.n || 0) > 0;
}

/**
 * Every operation stored after `have` ({ station: n }), each station's in sequence, and what the log now holds.
 * -> { ops, have }
 */
export async function opsSince(env, ev, have = {}) {
  const { meta } = await readMeta(env, ev);
  const need = (meta.batches || []).filter((b) => Object.entries(b.r).some(([s, [, max]]) => max > (have[s] || 0)));
  const ops = [];
  for (const b of need) {
    const o = await env.BUCKET.get(`chrono/${ev}/b/${b.k}.json`);
    if (o) for (const op of await o.json()) if (op.n > (have[op.s] || 0)) ops.push(op);
  }
  return { ops, have: { ...(meta.have || {}) } };
}
