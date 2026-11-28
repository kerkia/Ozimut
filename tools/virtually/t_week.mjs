// The « compétition de la semaine »'s worlds (site/assets/js/games/vweek.js, docs/pixel/competitions.md §5) checked in Node, on the
// worker's own code path (games/vgenworker.js build, called here without a Worker): for the weeks from the current one, the world
// and its three courses — format, terrain, size, time to make, and for each course its controls, km, climb, longest legs and
// estimated race time at the game's ×1 —; every week must give the courses « a », « b », « c », and the same id twice the same
// courses (vgenpack.js courseSig). Exit 1 on a failure.
//   node tools/virtually/t_week.mjs [weeks=15] [--once] [--from k]
import { weekOpts } from "../../site/assets/js/games/vweek.js";
import { weekId, WEEK_COURSES } from "../../site/assets/js/games/vweekid.js";
import { build } from "../../site/assets/js/games/vgenworker.js";
import { seedOf } from "../../site/assets/js/games/vgen.js";

// vgenpack.js's courseSig (that module imports the browser's map and texture code)
const courseSig = (courses) => seedOf(JSON.stringify(courses.map((c) => c.controls.map((p) => [p.x, p.z])))).toString(16);
const args = process.argv.slice(2), once = args.includes("--once");
const fromI = args.indexOf("--from"), from = fromI >= 0 ? +args[fromI + 1] : 0;
const weeks = +(args.find((a, i) => /^\d+$/.test(a) && args[i - 1] !== "--from") || 15);
const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
let fails = 0;
const fail = (m) => { fails++; console.log(`  FAIL ${m}`); };
const sum = {};

for (let k = from; k < from + weeks; k++) {
  const id = weekId(new Date(), k), o = weekOpts(id);
  const r = build(o);
  const what = o.sprint ? `town ${o.size} m (built ${o.buildings}, gardens ${o.gardens}, parks ${o.parks})`
    : `${o.type} ${o.size} m (relief ${o.relief}, detail ${o.detail}, green ${o.green}, paths ${o.paths})`;
  console.log(`${id} ${o.format.padEnd(6)} ${what}  ${(r.ms / 1000).toFixed(1)} s${r.seed !== o.seed ? `  (seed + ${(r.seed - o.seed) >>> 0})` : ""}`);
  const ids = r.courses.map((c) => c.id);
  if (JSON.stringify(ids) !== JSON.stringify(WEEK_COURSES)) fail(`courses ${ids.join(",") || "none"}`);
  for (const c of r.courses) {
    const legs = c.controls.slice(1).map((p, i) => dist(c.controls[i], p)), long = [...legs].sort((a, b) => b - a).slice(0, 3);
    console.log(`  ${c.id}  ${String(c.controls.length - 2).padStart(2)} controls  ${(c.length / 1000).toFixed(2)} km  ${String(c.climb).padStart(3)} m`
      + `  longest ${long.map((d) => Math.round(d)).join(" / ")} m  ×1 ≈ ${c.min ?? "?"} min`);
    const s = (sum[`${o.format} ${c.id}`] ||= { n: 0, km: 0, min: 0, ctl: 0 }); s.n++; s.km += c.length / 1000; s.min += c.min || 0; s.ctl += c.controls.length - 2;
  }
  (sum[`${o.format} time`] ||= { n: 0, ms: 0 }).ms += r.ms; sum[`${o.format} time`].n++;
  if (!once) {
    const r2 = build(o), a = courseSig(r.courses), b = courseSig(r2.courses);
    if (a !== b) fail(`not deterministic: ${a} then ${b}`); else console.log(`  sig ${a} (twice)`);
  }
}
console.log("\nmeans:");
for (const [k, s] of Object.entries(sum)) console.log(`  ${k.padEnd(10)} ` + (s.ms != null ? `${(s.ms / s.n / 1000).toFixed(1)} s to make`
  : `${(s.ctl / s.n).toFixed(1)} controls  ${(s.km / s.n).toFixed(2)} km  ×1 ≈ ${(s.min / s.n).toFixed(1)} min`));
console.log(fails ? `${fails} failure(s)` : "all good");
process.exit(fails ? 1 : 0);
