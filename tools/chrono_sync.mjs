// node tools/chrono_sync.mjs [<ChronOzimut checkout>] [--check]
//
// Ozimut Chrono lives in a repository of its own, https://github.com/kerkia/ChronOzimut (Mozilla Public License 2.0);
// this site carries a copy of its src/ folder as site/assets/js/chrono/ — the « Chrono » tab of an Orga event
// (pages/chrono.js) and the application's documentation in Orga's guide read it. Chrono is changed THERE, never here:
// this script replaces the copy with the checkout's src/ (the folder beside this repository by default,
// ../ChronOzimut from the main checkout) and notes the commit it came from in site/assets/js/chrono/UPSTREAM.
// `--check` changes nothing and fails when the copy differs from the checkout (a file edited here by mistake).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), check = args.includes("--check");
const given = args.find((a) => !a.startsWith("--"));
const candidates = [given, process.env.CHRONOZIMUT, path.join(here, "..", "..", "ChronOzimut"), "C:/Kerkia/Ozimut/ChronOzimut"].filter(Boolean);
const up = candidates.find((d) => fs.existsSync(path.join(d, "src", "log.js")) && fs.existsSync(path.join(d, "LICENSE")));
if (!up) { console.error(`chrono_sync: no ChronOzimut checkout found (${candidates.join(", ")}): give its folder`); process.exit(1); }
const from = path.join(up, "src"), to = path.join(here, "..", "site", "assets", "js", "chrono");

const walk = (d, base = d, out = []) => {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, base, out); else out.push(path.relative(base, p).replace(/\\/g, "/"));
  }
  return out.sort();
};
const git = (...a) => { try { return execFileSync("git", ["-C", up, ...a], { encoding: "utf8" }).trim(); } catch (e) { return ""; } };
const commit = git("rev-parse", "HEAD"), dirty = git("status", "--porcelain", "--", "src", "LICENSE") !== "";
const version = JSON.parse(fs.readFileSync(path.join(up, "package.json"), "utf8")).version;
const EXTRA = { LICENSE: fs.readFileSync(path.join(up, "LICENSE")), UPSTREAM: Buffer.from(
  `Ozimut Chrono ${version} — a copy of the src/ folder of https://github.com/kerkia/ChronOzimut\ncommit ${commit || "?"}${dirty ? " (with changes not committed there)" : ""}\n` +
  "Mozilla Public License 2.0 (LICENSE). Do not edit here: change it in that repository, then run tools/chrono_sync.mjs.\n") };

const want = new Map(walk(from).map((f) => [f, fs.readFileSync(path.join(from, f))]));
for (const [f, b] of Object.entries(EXTRA)) want.set(f, b);
const have = fs.existsSync(to) ? walk(to) : [];
const diff = [];
for (const [f, b] of want) { const p = path.join(to, f); if (!fs.existsSync(p) || !fs.readFileSync(p).equals(b)) diff.push(f); }
for (const f of have) if (!want.has(f)) diff.push(`${f} (not upstream)`);
if (check) {
  if (diff.length) { console.error(`chrono_sync: the copy differs from ${up} (${commit.slice(0, 7)}):\n  ${diff.join("\n  ")}`); process.exit(1); }
  console.log(`chrono_sync: the copy is ChronOzimut ${version} ${commit.slice(0, 7)}`);
  process.exit(0);
}
if (dirty) console.warn("chrono_sync: the checkout has changes that are not committed: the copy will not match any commit");
fs.rmSync(to, { recursive: true, force: true });
for (const [f, b] of want) { const p = path.join(to, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, b); }
console.log(`chrono_sync: ${want.size} files from ChronOzimut ${version} ${commit.slice(0, 7)} (${diff.length} changed)`);
