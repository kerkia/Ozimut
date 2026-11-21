// POST /api/track { page, visit } — counts one page view of the logged-in account, by day (Paris time) and page;
// visit: true when the page opens a new browser session (one visit). Shown to the administrator only, on the
// admin page; kept 13 months. Two upserts at most per page view, well within D1's free quota.
import { allow, json, readBody, withUser } from "../_lib/api.js";
import { recordPerf } from "../_lib/perf.js";
import { announceSoon, translateSoon } from "../_lib/nutrition.js";
import { robotsSoon } from "../_lib/robots.js";
import { bookingSoon } from "../_lib/booking.js";
import { maplibSoon } from "../_lib/maplib.js";
import { runsSoon } from "../_lib/ciwatch.js";

// the site's pages (app.js routes; the Réseau views apart) — anything else is refused
const PAGES = new Set(["overview", "ranking", "runner", "compare", "clubs", "club", "clubcompare", "courses", "agenda",
  "methods", "settings", "contact", "admin", "provisional", "splits", "deposit", "live", "relays", "analysis", "analysisPerso", "analysisOrga", "mapAnalysis", "myMaps", "track", "analysisClub", "analysisRace", "orgAnalyses", "orgRace", "orgTraining", "orgResults", "orgStarts", "booking", "orgDirect", "orgTracer", "orgMapper", "orgManage", "needCountry", "categories", "relayHistory", "games", "virtually", "vma", "descriptions", "mapkey", "learn", "nutrition", "nutritionWrite", "hub", "modtiles", "ask", "network:ego", "network:leaders", "network:territories", "network:stats"]);
const KEEP_DAYS = 400;

/** Today's date in Paris, YYYY-MM-DD; `plus` days later (negative: earlier). */
export const parisDay = (plus = 0) => {
  const d = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" }) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + plus);
  return d.toISOString().slice(0, 10);
};

export const onRequestPost = withUser(async (ctx, user) => {
  const { request, env } = ctx;
  // a « Santé » article whose day has come: its readers are told (at most every 10 minutes an isolate)
  announceSoon(ctx);
  translateSoon(ctx);            // and the Santé translations still to make, one at a time
  robotsSoon(ctx);               // the copy of Cloudflare's figures on the AI bots, when due (admin › « Robots »)
  bookingSoon(ctx);              // the start-time bookings closing, their start lists published, the day before's reminders
  maplibSoon(ctx);               // the maps sent to Ozimut copied into the administrators' collection, a few at a time
  runsSoon(ctx, allow);          // a results run GitHub's schedule skipped, started through workflow_dispatch (_lib/ciwatch.js)
  const b = await readBody(request);
  const page = String(b?.page || "");
  if (!PAGES.has(page)) return json({ error: "bad request" }, 400);
  const day = parisDay();
  const up = (p) => env.DB.prepare(
    "INSERT INTO usage_daily (user_id, day, page, views) VALUES (?, ?, ?, 1) ON CONFLICT (user_id, day, page) DO UPDATE SET views = views + 1",
  ).bind(user.id, day, p);
  const stmts = [up(page)];
  if (b.visit === true) stmts.push(up("_visit"));
  if (Math.random() < 0.01) stmts.push(env.DB.prepare("DELETE FROM usage_daily WHERE day < ?").bind(parisDay(-KEEP_DAYS)));
  await env.DB.batch(stmts);
  // how fast the page showed, the slowest reaction on the page before, the texts loaded late (admin › « Vitesse »): counted
  // by day, page and build, no account (_lib/perf.js), once the answer has gone
  ctx.waitUntil(recordPerf(env, b, day, PAGES).catch(() => {}));
  return json({ ok: true });
});
