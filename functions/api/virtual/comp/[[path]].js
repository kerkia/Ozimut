// /api/virtual/comp/… — Pixel's competitions (owner, 2026-11-28; docs/pixel/competitions.md §3.1 is the contract): played once, on
// one course per account, no pause. Two kinds: « orga », an organiser's (an event of api/virtual/events, type "competition",
// published and built, both dates set), and « week », the « compétition de la semaine » the site invents (Monday to Sunday in
// Paris, id week-YYYYWW, its world made in the browser from the id: games/vweekid.js, shared with this file, and games/vweek.js).
// The accounts with _lib/virtual.js compAllowed only (the administrators for now); anyone else 403 « closed ».
//   GET    comp                       { comps: [Comp], today }   every published orga competition (soon, open, over for under 60 days),
//                                     the current week, the next (soon) and the 8 before; today = Paris's day YYYY-MM-DD
//   GET    comp/<id>                  Comp
//   POST   comp/<id>/register { course, sig? }   → { my }   one course an account, changed while not started (not once over)
//   DELETE comp/<id>/register                    → { ok }   withdrawn, while not started
//   POST   comp/<id>/start { course, sig? }      → { ok, at }   the one attempt begins (« Partir »): open today, registered on that
//                                     course, not started; a week's sig the one registered (none registered: this one is kept)
//   POST   comp/<id>/runs { course, t, sp, d, route, cs, seed, sig? }   → { id, at }   the finished run: started, no run yet, within
//                                     6 hours of the start (a start at 23:50 may finish after the last day)
//   POST   comp/<id>/runs { course, dnf: true }  → { ok }   abandoned
//   GET    comp/<id>/results          { over, courses: { <course>: [Row] } }   times only — never a route here
// Comp = { id, kind, name, format, from, to, state, org, env, ghosts, courses, thumb, base, source, scale, std, lonlat, tex, mine,
//   my: null | { course, at, started, done, dnf, t, run }, entrants: { <course>: n } }
// Row = { u, name, state: "ok" | "running" | "dnf", t, at (the start), mine, run }; a week's rows only those of the world most of
// its runners made (the most frequent sig), so that one browser that made another world never pollutes the table.
// Storage (R2 cn-state): virtual-reg/<comp id>/<u>.json — { course, at, started, run, t, dnf, sig }, mirrored in custom metadata
// (c, at, st, run, t, dnf, sg, n the name shown) so that one list gives the entrants and the results; `u` = runnerHash. The runs as
// every Pixel run, virtual-runs/<comp id>/<course>/<u>-<time36>.json (the route; k "competition", e the competition, ws a week's
// world). A started attempt without a run for 6 hours counts as dnf. Account deletion removes the records (api/account/delete.js).
import { allow, isAdmin, json, nowIso, readBody, withUser } from "../../../_lib/api.js";
import { cleanEnv, compAllowed, EVENT_ID, eventState, readEvent, runnerHash } from "../../../_lib/virtual.js";
import { isWeek, parisDate, WEEK_COURSES, weekDays, weekFormat, weekId, weekShift, weekState } from "../../../../site/assets/js/games/vweekid.js";

const EV = "virtual-events/", REG = "virtual-reg/", RUNS = "virtual-runs/";
const SIG = /^[0-9a-f]{1,8}$/, CS = /^[0-9a-z]{1,8}$/;
const DNF_MS = 6 * 3600e3;                     // a started attempt with no run after 6 hours: abandoned
const KEEP_DAYS = 60;                          // an orga competition stays listed 60 days after its last day
const FORMATS = ["ld", "md", "sprint"];

async function listAll(env, prefix, opts = {}) {
  const out = []; let cursor;
  do {
    const r = await env.BUCKET.list({ prefix, cursor, limit: 1000, ...opts });
    out.push(...r.objects); cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}
const minusDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) - n * 86400e3).toISOString().slice(0, 10);
/** An event that is a competition one may enter: published, built, both dates. */
const isOrgaComp = (ev) => !!ev && ev.type === "competition" && !!ev.published && !!(ev.courses || []).length && !!ev.from && !!ev.to;

/** The competition behind an id: { kind, id, ev?, state, courses (ids) } or null. */
async function compOf(env, id) {
  if (isWeek(id)) return { kind: "week", id, state: weekState(id), courseIds: WEEK_COURSES };
  if (!EVENT_ID.test(id || "")) return null;
  const ev = await readEvent(env, id);
  if (!isOrgaComp(ev)) return null;
  return { kind: "orga", id, ev, state: eventState(ev), courseIds: ev.courses.map((c) => c.id) };
}

/** A registration record from its listed object's custom metadata (no read): its fields, with the 6-hour rule applied. */
function regOf(o) {
  const m = o.customMetadata || {}, started = m.st || "";
  const late = !!started && !m.run && Date.now() - Date.parse(started) > DNF_MS;
  return { u: o.key.split("/").pop().replace(/\.json$/, ""), course: m.c || "", at: m.at || "", started, run: m.run || "",
    t: m.t ? Number(m.t) : null, dnf: m.dnf === "1" || late, sig: m.sg || "", name: m.n || "" };
}
const myOf = (r) => (r ? { course: r.course, at: r.at, started: r.started, done: !!r.run, dnf: r.dnf, t: r.t, run: r.run } : null);

/** One's own record as stored (the object's body), or null. */
async function readReg(env, id, u) {
  const o = await env.BUCKET.get(`${REG}${id}/${u}.json`);
  return o ? o.json().catch(() => null) : null;
}
async function writeReg(env, id, u, rec, name) {
  const meta = { c: rec.course, at: rec.at, st: rec.started || "", run: rec.run || "", t: rec.t != null ? String(rec.t) : "",
    dnf: rec.dnf ? "1" : "", sg: rec.sig || "", n: String(name || "").slice(0, 80) };
  await env.BUCKET.put(`${REG}${id}/${u}.json`, JSON.stringify(rec), { httpMetadata: { contentType: "application/json" }, customMetadata: meta });
}
/** Has this stored record's attempt run past its 6 hours? */
const lateOf = (rec) => !!rec?.started && !rec.run && Date.now() - Date.parse(rec.started) > DNF_MS;

/** A Comp as the pages read it; `regs` the competition's listed registrations (or null: not listed). */
function compView(env, user, c, regs, me) {
  const mineReg = regs ? regs.find((r) => r.u === me) || null : null;
  const entrants = Object.fromEntries(c.courseIds.map((k) => [k, 0]));
  for (const r of regs || []) if (r.course in entrants) entrants[r.course] += 1;
  if (c.kind === "week") {
    const w = weekDays(c.id);
    return { id: c.id, kind: "week", name: "", format: weekFormat(c.id), from: w.from, to: w.to, state: c.state, org: "", env: null,
      ghosts: false, courses: [], thumb: false, base: "", source: "gen", scale: 0, std: "", lonlat: null, tex: [], mine: false,
      my: myOf(mineReg), entrants };
  }
  const ev = c.ev;
  return { id: c.id, kind: "orga", name: ev.name, format: FORMATS.includes(ev.format) ? ev.format : "", from: ev.from, to: ev.to,
    state: c.state, org: ev.orgName || "", env: cleanEnv(ev.env), ghosts: !!ev.ghosts, courses: ev.courses || [], thumb: !!ev.thumb,
    base: `/api/virtual/events/${ev.id}/pkg/`, source: ev.source || "", scale: ev.scale || 0, std: ev.std || "", lonlat: ev.lonlat || null,
    tex: ev.tex || [], mine: ev.by === user.id || isAdmin(env, user), my: myOf(mineReg), entrants };
}
const listRegs = async (env, id) => (await listAll(env, `${REG}${id}/`, { include: ["customMetadata"] })).map(regOf);

export const onRequestGet = withUser(async ({ env, params }, user) => {
  if (!env.BUCKET) return json({ error: "storage not configured" }, 500);
  if (!compAllowed(env, user)) return json({ error: "closed" }, 403);
  const path = [].concat(params.path || []), me = await runnerHash(env, user.id), today = parisDate();
  const nocache = { "Cache-Control": "private, no-store" };
  if (!path.length) {
    // the organisers' competitions: every event record read (a few dozen), as api/virtual/events lists them
    const objs = (await listAll(env, EV)).filter((o) => /^virtual-events\/e[a-z0-9]{9}\.json$/.test(o.key));
    const evs = (await Promise.all(objs.map((o) => readEvent(env, o.key.slice(EV.length, -5)))))
      .filter((ev) => isOrgaComp(ev) && ev.to >= minusDays(today, KEEP_DAYS));
    const cur = weekId(), weeks = [weekShift(cur, 1), cur, ...Array.from({ length: 8 }, (_, i) => weekShift(cur, -(i + 1)))];
    const cs = [...evs.map((ev) => ({ kind: "orga", id: ev.id, ev, state: eventState(ev, today), courseIds: ev.courses.map((c) => c.id) })),
      ...weeks.map((id) => ({ kind: "week", id, state: weekState(id), courseIds: WEEK_COURSES }))];
    const comps = await Promise.all(cs.map(async (c) => compView(env, user, c, await listRegs(env, c.id), me)));
    comps.sort((a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id));
    return json({ comps, today }, 200, nocache);
  }
  const c = await compOf(env, path[0]);
  if (!c) return json({ error: "not found" }, 404);
  const regs = await listRegs(env, c.id);
  if (path.length === 1) return json(compView(env, user, c, regs, me), 200, nocache);
  if (path.length === 2 && path[1] === "results") {
    // a week: only the rows of the world most of its runners made (one odd browser never pollutes the table)
    let rows = regs.filter((r) => r.started);
    if (c.kind === "week") {
      const n = {};
      for (const r of rows) if (r.sig) n[r.sig] = (n[r.sig] || 0) + 1;
      const top = Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b))[0];
      rows = rows.filter((r) => r.sig && r.sig === top);
    }
    const order = { ok: 0, running: 1, dnf: 2 };
    const courses = Object.fromEntries(c.courseIds.map((k) => [k, []]));
    for (const r of rows) {
      if (!(r.course in courses)) continue;
      const state = r.run ? "ok" : r.dnf ? "dnf" : "running";
      courses[r.course].push({ u: r.u, name: r.name, state, t: state === "ok" ? r.t : null, at: r.started, mine: r.u === me, run: r.run });
    }
    for (const k of Object.keys(courses)) courses[k].sort((a, b) => order[a.state] - order[b.state] || (a.t ?? 0) - (b.t ?? 0) || a.at.localeCompare(b.at));
    return json({ over: c.state === "over", courses }, 200, nocache);
  }
  return json({ error: "bad request" }, 400);
});

export const onRequestPost = withUser(async ({ request, env, params }, user) => {
  if (!env.BUCKET) return json({ error: "storage not configured" }, 500);
  if (!compAllowed(env, user)) return json({ error: "closed" }, 403);
  if (user.demo_until) return json({ error: "demo" }, 403);
  const path = [].concat(params.path || []);
  if (path.length !== 2) return json({ error: "bad request" }, 400);
  const c = await compOf(env, path[0]);
  if (!c) return json({ error: "not found" }, 404);
  const b = await readBody(request), course = String(b?.course || "");
  if (!c.courseIds.includes(course)) return json({ error: "bad request" }, 400);
  const sig = b?.sig == null || b.sig === "" ? "" : String(b.sig);
  if (sig && !SIG.test(sig)) return json({ error: "bad request" }, 400);
  const u = await runnerHash(env, user.id), name = user.display_name;
  const rec = await readReg(env, c.id, u);

  if (path[1] === "register") {
    if (!(await allow(env, `vcomp:${user.id}`, 30, 3600))) return json({ error: "rate" }, 429);
    if (c.state === "over" || (c.kind === "week" && c.id > weekShift(weekId(), 1))) return json({ error: "closed" }, 403);   // weeks: up to the next
    if (rec?.started) return json({ error: "started" }, 409);
    const next = { course, at: rec?.at || nowIso(), started: "", run: "", t: null, dnf: false, sig: c.kind === "week" ? sig || rec?.sig || "" : "" };
    await writeReg(env, c.id, u, next, name);
    return json({ my: myOf({ ...next, dnf: false }) });
  }
  if (path[1] === "start") {
    if (!(await allow(env, `vcomp:${user.id}`, 30, 3600))) return json({ error: "rate" }, 429);
    if (c.state !== "open") return json({ error: "closed" }, 403);
    if (!rec) return json({ error: "not registered" }, 403);
    if (rec.started) return json({ error: "started" }, 409);
    if (rec.course !== course) return json({ error: "other course" }, 409);
    if (c.kind === "week") {                              // the world the browser made: the one registered, else this one kept
      if (!sig || (rec.sig && rec.sig !== sig)) return json({ error: "world" }, 409);
      rec.sig = sig;
    }
    rec.started = nowIso();
    await writeReg(env, c.id, u, rec, name);
    return json({ ok: true, at: rec.started });
  }
  if (path[1] === "runs") {
    if (!(await allow(env, `vcomprun:${user.id}`, 20, 3600))) return json({ error: "rate" }, 429);
    if (!rec) return json({ error: "not registered" }, 403);
    if (!rec.started) return json({ error: "not started" }, 409);
    if (rec.course !== course) return json({ error: "other course" }, 409);
    if (rec.run || rec.dnf) return json({ error: "already run" }, 409);
    if (b?.dnf === true) {                                // abandoned (« Abandonner », a tab closed)
      rec.dnf = true;
      await writeReg(env, c.id, u, rec, name);
      return json({ ok: true });
    }
    // within 6 hours of a start made while the competition was open (a start at 23:50 may finish after its last day)
    if (lateOf(rec)) return json({ error: "closed" }, 403);
    if (c.kind === "week" && (!sig || sig !== rec.sig)) return json({ error: "world" }, 409);
    const t = Number(b?.t), sp = Array.isArray(b?.sp) ? b.sp.map(Number) : [];
    if (!(t > 0 && t < 86400) || sp.length > 60 || !sp.every((x) => x >= 0 && x <= t + 1)) return json({ error: "bad request" }, 400);
    // the route: [t s, x m, z m] every second or so, rounded to a decimetre; 6 hours at most (as api/virtual's runs)
    const route = (Array.isArray(b?.route) ? b.route : []).slice(0, 22000)
      .filter((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)).map(([a, x, z]) => [Math.round(a * 10) / 10, Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
    const id = `${u}-${Date.now().toString(36)}`, at = nowIso(), seed = Number(b?.seed), d = Number(b?.d), tt = Math.round(t * 10) / 10;
    const meta = { u, n: String(name || "").slice(0, 80), t: String(tt), sp: sp.map((x) => Math.round(x * 10) / 10).join(","),
      at, h: "0", d: Number.isFinite(d) ? String(Math.round(d)) : "0", s: seed > 0 && seed < 20000 ? String(Math.round(seed)) : "",
      k: "competition", e: c.id };
    if (CS.test(String(b?.cs || ""))) meta.cs = String(b.cs);   // the signature of the course run (pages/virtuallysrc.js courseSig)
    if (c.kind === "week") meta.ws = rec.sig;                    // the world's signature (games/vgenpack.js courseSig of its courses)
    await env.BUCKET.put(`${RUNS}${c.id}/${course}/${id}.json`, JSON.stringify({ route }),
      { httpMetadata: { contentType: "application/json" }, customMetadata: meta });
    rec.run = id; rec.t = tt;
    await writeReg(env, c.id, u, rec, name);
    return json({ id, at });
  }
  return json({ error: "bad request" }, 400);
});

export const onRequestDelete = withUser(async ({ env, params }, user) => {
  if (!env.BUCKET) return json({ error: "storage not configured" }, 500);
  if (!compAllowed(env, user)) return json({ error: "closed" }, 403);
  if (user.demo_until) return json({ error: "demo" }, 403);
  const path = [].concat(params.path || []);
  if (path.length !== 2 || path[1] !== "register") return json({ error: "bad request" }, 400);
  const c = await compOf(env, path[0]);
  if (!c) return json({ error: "not found" }, 404);
  if (!(await allow(env, `vcomp:${user.id}`, 30, 3600))) return json({ error: "rate" }, 429);
  const u = await runnerHash(env, user.id), rec = await readReg(env, c.id, u);
  if (!rec) return json({ error: "not registered" }, 403);
  if (rec.started) return json({ error: "started" }, 409);
  await env.BUCKET.delete(`${REG}${c.id}/${u}.json`);
  return json({ ok: true });
});
