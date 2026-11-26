// The courses of an invented « Pixel » race set again on its saved world (owner, 2026-11-26: the last control shared by every course
// and taped to the finish), the world itself untouched: gen.mjs saved it in DATA/<race>/gen/ (h.f32, cls.u8) and the package's
// feats.json holds its control sites. The same course setter as gen.mjs and the browser (site/assets/js/games/vcourse.js).
//   node gencourses.mjs <race> [tries]      (from tools/virtually; then py pkggz.py is run by upload.py: py upload.py <race> [--remote])
// Writes the courses into DATA/<race>/pkg/race.json and DATA/<race>/gen/world.json.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { CL, SPEED } from "../../site/assets/js/games/vgen.js";
import { setCourses, GEN_LEVELS } from "../../site/assets/js/games/vcourse.js";

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const DATA = process.env.VIRTUAL_DATA || path.join(execFileSync("py", ["-c", "import paths; print(paths.DATA_DIR)"], { cwd: path.resolve(HERE, "../.."), encoding: "utf8" }).trim(), "virtual");
const [race, triesS = "1200"] = process.argv.slice(2);
if (!race) { console.error("node gencourses.mjs <race> [tries]"); process.exit(2); }
const pkg = path.join(DATA, race, "pkg"), gen = path.join(DATA, race, "gen");
const R = JSON.parse(readFileSync(path.join(pkg, "race.json"), "utf8"));
const F = JSON.parse(readFileSync(path.join(pkg, "feats.json"), "utf8"));
const buf = (f) => { const b = readFileSync(path.join(gen, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const h = new Float32Array(buf("h.f32")), cls = new Uint8Array(buf("cls.u8"));
if (h.length !== R.W * R.H || cls.length !== R.W * R.H) throw new Error(`the saved world is not ${R.W} × ${R.H}`);
if (JSON.stringify(R.classes) !== JSON.stringify(CL)) throw new Error("the package's ground classes are not vgen.js's");
const t0 = performance.now();
const courses = setCourses({ W: R.W, H: R.H, h, cls, classes: CL, speed: CL.map((n) => SPEED[n]), features: F.features },
  { seed: R.gen?.seed || 7, tries: +triesS, levels: GEN_LEVELS, ends: 12 });   // more candidate last controls than the browser's 3
console.log(`${race}: ${((performance.now() - t0) / 1000).toFixed(1)} s`, courses.map((c) => `${c.id} ${c.controls.length - 2} / ${(c.length / 1000).toFixed(1)} km`).join(", "));
if (!courses.length) process.exit(1);
R.courses = courses;
writeFileSync(path.join(pkg, "race.json"), JSON.stringify(R));
const W = JSON.parse(readFileSync(path.join(gen, "world.json"), "utf8")); W.race.courses = courses;
writeFileSync(path.join(gen, "world.json"), JSON.stringify(W));
