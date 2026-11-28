// Pixel's invented terrain made off the page's thread (games/vgenpack.js starts it): the world (games/vgen.js) and its six courses
// (games/vcourse.js), the progress sent as it goes, the arrays handed over without a copy.
// The « compétition de la semaine » (games/vweek.js) passes its own `levels`, `tries` and `ends` for the course setters, `retry`
// (a seed that gives fewer courses than levels is followed by seed + 1, + 2 … up to `retry` more: still deterministic, never a time
// budget) and `estimate` (each course's time at the game's ×1, minutes, as `min`: games/vcourse.js timer). build() is also what
// vgenpack.js runs without a worker and tools/virtually/t_week.mjs runs in Node.
import { generate, CL, SPEED } from "./vgen.js";
import { setCourses, GEN_LEVELS, timer } from "./vcourse.js";
import { generateTown } from "./vtowngen.js";
import { setSprintCourses, SPRINT_LEVELS } from "./vcoursesprint.js";

/** The world and its courses: { world, courses, ms, seed (the one that gave them) }. */
export function build(opts, onStep = () => {}) {
  const t0 = performance.now(), want = (opts.levels || (opts.sprint ? SPRINT_LEVELS : GEN_LEVELS)).length;
  let world, courses, seed = opts.seed;
  for (let k = 0; k <= (opts.retry || 0); k++) {
    const o = { ...opts, seed: (opts.seed + k) >>> 0 };
    // an invented town (a sprint), else a forest
    const w = o.sprint ? generateTown({ ...o, onStep }) : generate({ ...o, onStep });
    onStep("courses", 0);
    const pkg = { W: w.W, H: w.H, h: w.h, cls: w.cls, classes: CL, speed: CL.map((n) => SPEED[n]), features: w.features, obst: w.obst };
    const cs = o.sprint ? setSprintCourses(pkg, { seed: o.seed, tries: o.tries || 160, levels: o.levels || SPRINT_LEVELS, ends: o.ends || 6 })
      : setCourses(pkg, { seed: o.seed, tries: o.tries || 260, levels: o.levels || GEN_LEVELS, ends: o.ends || 3 });
    if (!world || cs.length > courses.length) { world = w; courses = cs; seed = o.seed; }
    if (cs.length >= want) break;
  }
  if (opts.estimate) {
    const pkg = { W: world.W, H: world.H, h: world.h, cls: world.cls, speed: CL.map((n) => SPEED[n]) }, T = timer(pkg, opts.sprint ? 1 : 2);
    for (const c of courses) {
      let t = 0; for (let k = 1; k < c.controls.length; k++) { const a = c.controls[k - 1], b = c.controls[k]; t += T([a.x, a.z], [b.x, b.z]); }
      c.min = Number.isFinite(t) ? Math.round(t / 6) / 10 : null;
    }
  }
  return { world, courses, seed, ms: Math.round(performance.now() - t0) };
}

// in a worker only (vgenpack.js and the tests import build() on their own thread)
if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) self.onmessage = (e) => {
  const { opts } = e.data;
  try {
    const done = build(opts, (step, f) => self.postMessage({ step, f })), { world } = done;
    const moved = [world.h.buffer, world.cls.buffer, world.veg.buffer, world.ground.buffer];
    if (world.town) moved.push(world.surf.buffer, world.trees.buffer, ...Object.values(world.town.arrays).map((a) => a.buffer));
    self.postMessage({ done }, moved);
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
};
