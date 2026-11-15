// The runs GitHub skips, started by the site itself (owner, 2026-11-15).
//
// update.yml is scheduled every hour, and every 20 minutes on Saturday and Sunday evenings for the organisers' results, but
// GitHub's schedules are best-effort: from 8 to 15 November 2026 it started 7 to 10 of the 24 to 45 runs planned a day, none
// at all from 17:05 to after 20:30 UTC on Sunday 15 November, and the races of that weekend waited for their results. So a
// signed-in page view (api/track.js, at most every 10 minutes an isolate, and once every 10 minutes for the whole site by the
// D1 rate key) asks GitHub for the workflow's latest runs and, when none is running and the last one that collected
// anything (scheduled or started by hand or by the site, not a push's deploy-only run) is older than the schedule allows,
// starts one through workflow_dispatch with GH_DISPATCH_TOKEN (the token uploads and generated maps already use):
//   Saturday and Sunday 16:00-22:59 UTC (the cron's window)  mode "prov", the last one over 25 minutes ago
//   otherwise                                                 mode "quick" (it runs the provisional results after), over 70 minutes
// The daily full (03:00 Paris) and agenda (06:00 Paris) runs are left to GitHub: few visitors at those hours, and a quick
// run catches up on the competitions meanwhile. Nothing is stored: GitHub's list of runs is the state.
import { allow } from "./api.js";

const EVERY_MS = 10 * 60e3;
const WEEKEND_MIN = 25;
const HOURLY_MIN = 70;
const COLLECTING = new Set(["schedule", "workflow_dispatch"]);
const BUSY = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);
let lastCheck = 0;

/** What the schedule wants now: { mode, minutes } (the mode to start, the age past which the last collecting run is late). */
export function due(now = new Date()) {
  const day = now.getUTCDay(), hour = now.getUTCHours();
  return (day === 6 || day === 0) && hour >= 16 && hour <= 22 ? { mode: "prov", minutes: WEEKEND_MIN } : { mode: "quick", minutes: HOURLY_MIN };
}

/** From the workflow's latest runs (GitHub's list, newest first): the mode to start, or null (one is running, or the last is recent). */
export function decide(runs, now = new Date()) {
  if (runs.some((r) => BUSY.has(r.status))) return null;
  const last = runs.find((r) => COLLECTING.has(r.event));
  const want = due(now);
  if (last && now - Date.parse(last.created_at) < want.minutes * 60e3) return null;
  return want.mode;
}

const headers = (env) => ({ Authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "ozimut-ciwatch" });

/** Looks, and starts a run when one is late; the mode started, or null. */
export async function watchRuns(env, now = new Date()) {
  if (!env.GH_DISPATCH_TOKEN || !env.DB) return null;
  if (!(await allow(env, "ci:watch", 1, EVERY_MS / 1000))) return null;      // another isolate looked in these 10 minutes
  const base = `https://api.github.com/repos/${env.GH_REPO || "kerkia/Ozimut"}/actions/workflows/update.yml`;
  const r = await fetch(`${base}/runs?per_page=15`, { headers: headers(env) });
  if (!r.ok) return null;
  const mode = decide((await r.json()).workflow_runs || [], now);
  if (!mode) return null;
  const d = await fetch(`${base}/dispatches`, { method: "POST", headers: { ...headers(env), "Content-Type": "application/json" },
    body: JSON.stringify({ ref: "main", inputs: { mode } }) });
  return d.status === 204 ? mode : null;
}

/** At most every 10 minutes an isolate (api/track.js, after the response, ctx.waitUntil). */
export function runsSoon(ctx) {
  if (!ctx.env.GH_DISPATCH_TOKEN || Date.now() - lastCheck < EVERY_MS) return;
  lastCheck = Date.now();
  ctx.waitUntil(watchRuns(ctx.env).catch(() => null));
}
