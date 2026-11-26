// Pixel's invented terrain made off the page's thread (games/vgenpack.js starts it): the world (games/vgen.js) and its six courses
// (games/vcourse.js), the progress sent as it goes, the arrays handed over without a copy.
import { generate, CL, SPEED } from "./vgen.js";
import { setCourses, GEN_LEVELS } from "./vcourse.js";
import { generateTown } from "./vtowngen.js";
import { setSprintCourses } from "./vcoursesprint.js";

self.onmessage = (e) => {
  const { opts } = e.data;
  try {
    const t0 = performance.now();
    const onStep = (step, f) => self.postMessage({ step, f });
    // an invented town (a sprint), else a forest
    const world = opts.sprint ? generateTown({ ...opts, onStep }) : generate({ ...opts, onStep });
    self.postMessage({ step: "courses", f: 0 });
    const pkg = { W: world.W, H: world.H, h: world.h, cls: world.cls, classes: CL, speed: CL.map((n) => SPEED[n]), features: world.features, obst: world.obst };
    const courses = opts.sprint ? setSprintCourses(pkg, { seed: opts.seed, tries: opts.tries || 160 })
      : setCourses(pkg, { seed: opts.seed, tries: opts.tries || 260, levels: GEN_LEVELS });
    const moved = [world.h.buffer, world.cls.buffer, world.veg.buffer, world.ground.buffer];
    if (world.town) moved.push(world.surf.buffer, world.trees.buffer, ...Object.values(world.town.arrays).map((a) => a.buffer));
    self.postMessage({ done: { world, courses, ms: Math.round(performance.now() - t0) } }, moved);
  } catch (err) {
    self.postMessage({ error: String(err?.message || err) });
  }
};
