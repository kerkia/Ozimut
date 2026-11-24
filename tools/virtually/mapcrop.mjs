// Pieces of a race's map as the site's own renderer draws them (what the PDF shows), to look at a place while working on the
// generator:   node mapcrop.mjs <race> <out folder> <name:E:N:size m[:px per mm]> …   (Lambert 93; headless Edge, as thumb.mjs)
import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const SITE = path.resolve(HERE, "../../site");
const DATA = process.env.VIRTUAL_DATA || path.join(execFileSync("py", ["-c", "import paths; print(paths.DATA_DIR)"], { cwd: path.resolve(HERE, "../.."), encoding: "utf8" }).trim(), "virtual");
const [race, out, ...specs] = process.argv.slice(2);
const RD = path.join(DATA, race);
const crops = specs.map((s) => { const [name, e, n, size, ppm = "40"] = s.split(":"); return { name, e: +e, n: +n, size: +size, ppm: +ppm }; });
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".woff2": "font/woff2" };
const PAGE = `<!doctype html><meta charset="utf-8"><body><script type="module">
import { readOcad } from "/assets/js/tracer/vmap/ocad.js";
import { CanvasTarget } from "/assets/js/tracer/vmap/target.js";
import { Matrix } from "/assets/js/tracer/vmap/geom.js";
try {
const { map } = readOcad(new Uint8Array(await (await fetch("/race/" + (new URLSearchParams(location.search).get("f") || "map.ocd"))).arrayBuffer()));
await map.ready;
const rw = map.realWorld, k = 1000 / map.scale;
const skip = new Set(map.symdefs.map((d) => d.id).filter((id) => parseInt(id, 10) >= 900));
window.out = ${JSON.stringify(crops)}.map((c) => {
  const cx = (c.e - rw.x) * k, cy = (c.n - rw.y) * k, h = c.size * k / 2, px = Math.round(2 * h * c.ppm);
  const cv = document.createElement("canvas"); cv.width = cv.height = px;
  const g = cv.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, px, px);
  map.draw(new CanvasTarget(g, new Matrix(c.ppm, 0, 0, -c.ppm, -(cx - h) * c.ppm, (cy + h) * c.ppm)), [cx - h, cy - h, cx + h, cy + h], { minRes: 1 / c.ppm, hideSyms: skip });
  return cv.toDataURL("image/png");
});
} catch (e) { window.out = "ERR " + e.stack; }
</script>`;
const server = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p === "/") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(PAGE); return; }
  const file = p.startsWith("/race/") ? path.join(RD, p.slice(6)) : path.join(SITE, p);
  try { const b = await readFile(file); res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" }); res.end(b); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true, args: ["--no-first-run", "--disable-extensions", "--no-sandbox"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("page error:", e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/` + (process.env.MAPFILE ? "?f=" + process.env.MAPFILE : ""));
await page.waitForFunction("window.out", { timeout: 300000 });
const urls = await page.evaluate(() => window.out);
if (typeof urls === "string") { console.log(urls); process.exit(1); }
await mkdir(out, { recursive: true });
for (let i = 0; i < crops.length; i++) await writeFile(path.join(out, crops[i].name + ".png"), Buffer.from(urls[i].split(",")[1], "base64"));
console.log(crops.map((c) => c.name).join(" "));
await browser.close(); server.close();
