// Runs the app's smoke test (main.mjs, `--smoke`) and passes on its verdict: exit 0 once the app has printed
// « SMOKE OK <version> », 1 otherwise.
//
//   node smoke.mjs                 the development app (node_modules' Electron on this folder)
//   node smoke.mjs --unpacked      the unpacked build under dist/ (electron-builder --dir, or what a full build leaves)
//   node smoke.mjs <program>       any packaged program: the unpacked exe, the portable exe, an AppImage
//   node smoke.mjs --doc […]       the same, then Help › Documentation's window opened and its page drawn (`--smoke-doc`)
//
// The app's lines are read from a file (CHRONO_SMOKE_OUT): a packaged Windows app has no console of its own. On Linux
// the app is started with --no-sandbox, as build machines lack what Chromium's sandbox wants.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const WAIT_S = 120;                                        // the app gives up by itself well before

function unpacked() {
  const dist = path.join(here, "dist");
  const dirs = fs.existsSync(dist) ? fs.readdirSync(dist) : [];
  const first = (list) => list.find((f) => fs.existsSync(f));
  if (process.platform === "win32") return first(dirs.filter((d) => /^win.*-unpacked$/.test(d)).map((d) => path.join(dist, d, "Ozimut Chrono.exe")));
  if (process.platform === "darwin") return first(dirs.filter((d) => /^mac/.test(d)).map((d) => path.join(dist, d, "Ozimut Chrono.app", "Contents", "MacOS", "Ozimut Chrono")));
  return first(dirs.filter((d) => /^linux.*-unpacked$/.test(d)).map((d) => path.join(dist, d, "ozimut-chrono")));
}

const flags = process.argv.slice(2), doc = flags.includes("--doc"), arg = flags.find((f) => f !== "--doc") || "";
let program, args;
if (!arg) {
  program = createRequire(import.meta.url)("electron");    // the path of node_modules' Electron (fetched the first time)
  args = [here];
} else {
  program = arg === "--unpacked" ? unpacked() : path.resolve(arg);
  args = [];
  if (!program || !fs.existsSync(program)) { console.error(`smoke: no program to run (${arg === "--unpacked" ? "nothing unpacked under dist/" : program})`); process.exit(1); }
}
args.push(doc ? "--smoke-doc" : "--smoke");
if (process.platform === "linux") args.push("--no-sandbox");

const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ozimut-chrono-smoke-out-")), "result.txt");
const env = { ...process.env, CHRONO_SMOKE: "1", CHRONO_SMOKE_OUT: out };
delete env.ELECTRON_RUN_AS_NODE;                           // set by some shells' tools: Electron would run as plain Node

console.log(`smoke: ${program} ${args.join(" ")}`);
const child = spawn(program, args, { cwd: here, env, stdio: ["ignore", "ignore", "inherit"], windowsHide: true });
const late = setTimeout(() => { console.error(`smoke: no answer after ${WAIT_S} s, stopping the app`); child.kill(); }, WAIT_S * 1000);
child.on("error", (e) => { clearTimeout(late); console.error(`smoke: ${e.message}`); process.exit(1); });
child.on("close", (code, signal) => {
  clearTimeout(late);
  let text = "";
  try { text = fs.readFileSync(out, "utf8"); } catch (e) { /* the app never got that far */ }
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
  process.stdout.write(text || `smoke: the app said nothing (exit ${code ?? signal})\n`);
  process.exit(code === 0 && /^SMOKE OK /m.test(text) ? 0 : 1);
});
