// GET /api/admin/perf?days=30 — how fast the site is (2026-11-17, _lib/perf.js, D1 perf_daily): over the last `days` days,
// the pages' times to show, the slowest reactions and the texts loaded late, by page and kind, by build of the code and by
// day. { ready: false } before migration 0028.
import { json, withUser } from "../../_lib/api.js";
import { BUCKETS } from "../../_lib/perf.js";
import { parisDay } from "../track.js";

const SUMS = "SUM(n) AS n, SUM(sum_ms) AS ms, SUM(b0) AS b0, SUM(b1) AS b1, SUM(b2) AS b2, SUM(b3) AS b3, SUM(b4) AS b4, SUM(b5) AS b5";

export const onRequestGet = withUser(async ({ request, env }) => {
  const days = Math.min(400, Math.max(1, parseInt(new URL(request.url).searchParams.get("days"), 10) || 30));
  const from = parisDay(-days + 1);
  try {
    const [pages, builds, daily] = await env.DB.batch([
      env.DB.prepare(`SELECT page, kind, ${SUMS} FROM perf_daily WHERE day >= ? GROUP BY page, kind`).bind(from),
      env.DB.prepare(`SELECT build, kind, MIN(day) AS first, MAX(day) AS last, ${SUMS} FROM perf_daily WHERE day >= ? AND kind != 'late' GROUP BY build, kind`).bind(from),
      env.DB.prepare(`SELECT day, kind, ${SUMS} FROM perf_daily WHERE day >= ? AND kind != 'late' GROUP BY day, kind ORDER BY day`).bind(from),
    ]);
    return json({ ready: true, days, from, buckets: BUCKETS, pages: pages.results, builds: builds.results, daily: daily.results });
  } catch (e) {
    return json({ ready: false, days, from, buckets: BUCKETS, pages: [], builds: [], daily: [] });
  }
}, { admin: true });
