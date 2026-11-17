// How fast the site is (2026-11-17; admin › « Vitesse »): what a page view says of its speed (api/track.js), kept in D1
// `perf_daily` (migration 0028) as counts by day, page, kind and build — no account. Before the migration nothing is kept.
export const BUCKETS = [300, 600, 1200, 2500, 5000];          // ms: b0 under 300 … b5 from 5 s on
const KEEP_DAYS = 400;

const bucket = (ms) => { const i = BUCKETS.findIndex((b) => ms < b); return i < 0 ? BUCKETS.length : i; };
const whole = (v, max) => (Number.isFinite(v) && v >= 0 ? Math.min(max, Math.round(v)) : null);

/** The rows a page view's body gives: [{ page, kind, ms }]. `pages`: the pages the site has. */
export function perfRows(b, pages) {
  const out = [];
  const ms = whole(b?.perf?.ms, 600e3);
  if (ms != null && pages.has(String(b.page))) out.push({ page: String(b.page), kind: b.perf.first === true ? "first" : "nav", ms });
  const tap = whole(b?.tap?.ms, 60e3);
  if (tap != null && pages.has(String(b.tap.page))) out.push({ page: String(b.tap.page), kind: "tap", ms: tap });
  if (Array.isArray(b?.late)) {
    for (const k of b.late.slice(0, 10)) if (typeof k === "string" && /^[\w.:-]{1,80}$/.test(k)) out.push({ page: k, kind: "late", ms: 0 });
  }
  return out;
}

/** Counts a page view's figures; quiet when the table is not there yet. */
export async function recordPerf(env, b, day, pages) {
  const rows = perfRows(b, pages);
  if (!rows.length || !env.DB) return;
  const build = /^[0-9a-f]{8,40}$/.test(String(b.build || "")) ? String(b.build).slice(0, 8) : "";
  const stmts = rows.map((r) => {
    const bs = BUCKETS.map((_, i) => (bucket(r.ms) === i ? 1 : 0)).concat(bucket(r.ms) === BUCKETS.length ? 1 : 0);
    return env.DB.prepare(`INSERT INTO perf_daily (day, page, kind, build, n, sum_ms, b0, b1, b2, b3, b4, b5) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (day, page, kind, build) DO UPDATE SET n = n + 1, sum_ms = sum_ms + excluded.sum_ms, b0 = b0 + excluded.b0,
      b1 = b1 + excluded.b1, b2 = b2 + excluded.b2, b3 = b3 + excluded.b3, b4 = b4 + excluded.b4, b5 = b5 + excluded.b5`)
      .bind(day, r.page, r.kind, build, r.ms, ...bs);
  });
  if (Math.random() < 0.01) {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - KEEP_DAYS);
    stmts.push(env.DB.prepare("DELETE FROM perf_daily WHERE day < ?").bind(d.toISOString().slice(0, 10)));
  }
  try { await env.DB.batch(stmts); } catch (e) { /* no table yet (migration 0028): nothing kept */ }
}
