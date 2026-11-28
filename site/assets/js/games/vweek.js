// Pixel's « compétition de la semaine »: its world (owner, 2026-11-28; docs/pixel/competitions.md §5). One invented world a week,
// made in the browser from the week's id (games/vweekid.js) as the « Carte du jour » was: the same id gives everyone the same world
// and the same three courses « a », « b », « c », in Node too (tools/virtually/t_week.mjs). Deterministic: the seed is the id's,
// every varying choice is drawn from a generator of that seed, the course setters take a fixed number of tries, and a seed that
// gives fewer than three courses is followed by seed + 1, + 2 … (games/vgenworker.js build's `retry`), never a time budget.
// - « ld » (long distance): a forest of 1 600 m, much relief and detail, few controls, a few very long legs with real route
//   choices (games/vcourse.js WEEK_LEVELS.ld: judged on the ground);
// - « md » (middle distance): a forest of 1 200 m, many short legs away from the handrails, changes of direction;
// - « sprint »: an invented town of 800-1000 m, its buildings, gardens and parks anywhere on their dials (games/vtowngen.js), the orange courses' rules (games/vcoursesprint.js).
// Target times at the game's ×1 (a good club runner; IOF winning times: long 70-100 min, middle 30-35, sprint 12-15): « a » about
// 70 / 30 / 14 minutes. Static imports here are the pure ones (the server and the tests may read weekOpts); the package is built
// by games/vgenpack.js, loaded when a race is made.

import { prng, seedOf } from "./vgen.js";
import { WEEK_LEVELS } from "./vcourse.js";
import { WEEK_SPRINT_LEVELS } from "./vcoursesprint.js";
import { weekFormat, isWeek } from "./vweekid.js";

// the terrain types with relief and features (vgen.js RECIPES): not « pine », the flat plantation
export const WEEK_TYPES = ["moraine", "karst", "sandrock", "valley"];
// how many seeds after the week's own are tried before giving up (none has been needed in the weeks tested)
const RETRY = 6;
const r2 = (v) => Math.round(v * 100) / 100;

/** The generator's options for a week (null for a bad id): { format, seed, size, levels, tries, ends, retry, estimate, … }. */
export function weekOpts(id) {
  if (!isWeek(id)) return null;
  const format = weekFormat(id), seed = seedOf(`pixel-week-${id}`), rnd = prng(seed);
  const common = { format, seed, retry: RETRY, estimate: true };
  if (format === "sprint") {
    // a town's dials vary widely from week to week (owner, 2026-11-28: « strong relief and detail » is the forest's rule; a sprint
    // is less sensitive to them): a dense old centre one week, houses in their gardens or parks the next
    return { ...common, sprint: true, size: 800 + 100 * Math.floor(rnd() * 3), buildings: r2(rnd.range(0.1, 0.95)),
      gardens: r2(rnd.range(0.05, 0.95)), parks: r2(rnd.range(0.05, 0.9)), levels: WEEK_SPRINT_LEVELS, tries: 160, ends: 6 };
  }
  const type = WEEK_TYPES[Math.floor(rnd() * WEEK_TYPES.length)];
  return { ...common, type, size: format === "ld" ? 1600 : 1200, relief: r2(rnd.range(0.7, 1)), detail: r2(rnd.range(0.7, 1)),
    green: r2(rnd.range(0.2, 0.8)), paths: r2(rnd.range(0.25, 0.75)), levels: WEEK_LEVELS[format], tries: format === "ld" ? 220 : 260, ends: 6 };
}

// the worlds made stay in memory for the visit (as pages/virtually.js dayRace): a promise by id
const MADE = new Map();

/**
 * The week's race, as pages/virtuallygen.js makes the « Carte du jour »'s: { id, name, gen: true, week: true, format, sig, ms, size,
 * seed, race: { id, scale, std, source, courses }, load: async () => package }. title: the map's title (the page's words);
 * onStep(step, share) while it is made (vgenworker's steps: relief … courses).
 */
export function weekRace(id, { title = "", onStep = () => {} } = {}) {
  if (MADE.has(id)) return MADE.get(id);
  const o = weekOpts(id);
  if (!o) return Promise.reject(new Error(`not a week: ${id}`));
  const p = (async () => {
    const P = await import("./vgenpack.js");
    const res = await P.makeWorld(o, onStep);
    let data = null;
    const load = async () => (data ||= await P.packageOf(res, { id, title }));
    const race = o.sprint ? { id, scale: 4000, std: "ISSprOM 2019", source: "gentown", courses: res.courses }
      : { id, scale: 10000, std: "ISOM 2017-2", source: "gen", courses: res.courses };
    return { id, name: title, gen: true, week: true, format: o.format, sig: P.courseSig(res.courses), ms: res.ms, size: res.world.W,
      seed: res.seed, race, load };
  })();
  MADE.set(id, p);
  p.catch(() => MADE.delete(id));                         // a failure is tried again next time
  return p;
}
