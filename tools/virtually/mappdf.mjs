// A race's map as a vector PDF at its scale (the helpers 900 and up left out), and a second page with the legibility check's
// errors circled, for a mapper's review:   node mappdf.mjs <race> <out.pdf>   (headless Edge, as thumb.mjs)
import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Z]:)/, "$1");
const SITE = path.resolve(HERE, "../../site");
const DATA = process.env.VIRTUAL_DATA || path.join(execFileSync("py", ["-c", "import paths; print(paths.DATA_DIR)"], { cwd: path.resolve(HERE, "../.."), encoding: "utf8" }).trim(), "virtual");
const [race, out] = process.argv.slice(2);
const RD = path.join(DATA, race);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".woff2": "font/woff2", ".woff": "font/woff" };
const PAGE = `<!doctype html><meta charset="utf-8"><body><script type="module">
import { readOcad } from "/assets/js/tracer/vmap/ocad.js";
import { PdfTarget } from "/assets/js/tracer/vmap/target.js";
import { Matrix } from "/assets/js/tracer/vmap/geom.js";
import { pdfLib, makeFonts } from "/assets/js/tracer/pdf.js";
try {
const { map } = readOcad(new Uint8Array(await (await fetch("/race/map.ocd")).arrayBuffer()));
await map.ready;
const leg = await (await fetch("/race/src/legibility.json")).json().catch(() => null);
const rw = map.realWorld || {};
const b = map.bounds(), M = 5, r = [b[0] - M, b[1] - M, b[2] + M, b[3] + M];
const pt = 72 / 25.4, W = (r[2] - r[0]) * pt, H = (r[3] - r[1]) * pt;
const L = await pdfLib(), doc = await L.PDFDocument.create();
doc.setTitle(${JSON.stringify(race)} + " — 1:" + map.scale); doc.setCreator("Ozimut");
const fonts = await makeFonts(doc, L);
const skip = new Set(map.symdefs.map((d) => d.id).filter((id) => parseInt(id, 10) >= 900));
const errs = [];
if (leg) for (const [k, e] of Object.entries(leg.entries || {})) if (e.sev === "error" && e.left) for (const p of (e.places || [])) errs.push({ k, ...p });
const mmPerM = 1000 / map.scale;
for (const withErr of [false, true]) {
  if (withErr && !errs.length) break;
  const page = doc.addPage([W, H]);
  const tg = new PdfTarget(L, page, new Matrix(pt, 0, 0, pt, -r[0] * pt, -r[1] * pt), { fonts, minRes: 0.01 });
  map.draw(tg, r, { minRes: 0.01, hideSyms: skip });
  await tg.finish();
  if (withErr) {
    const red = L.rgb(0.9, 0, 0);
    errs.forEach((e, i) => {
      const x = ((e.at[0] - rw.x) * mmPerM - r[0]) * pt, y = ((e.at[1] - rw.y) * mmPerM - r[1]) * pt;
      page.drawCircle({ x, y, size: 6 * pt, borderColor: red, borderWidth: 1.2 });
      page.drawText(String(i + 1), { x: x + 6.5 * pt, y: y + 3 * pt, size: 11, color: red });
    });
    let y = H - 20;
    page.drawRectangle({ x: 8, y: H - 18 - 14 * (errs.length + 1), width: 330, height: 14 * (errs.length + 1) + 10, color: L.rgb(1, 1, 1), opacity: 0.85 });
    page.drawText("Legibility errors left", { x: 14, y, size: 10, color: red }); y -= 14;
    errs.forEach((e, i) => { page.drawText(String(i + 1) + ". " + e.k + " — " + (e.detail || "") + " (E " + e.at[0].toFixed(0) + " N " + e.at[1].toFixed(0) + ")", { x: 14, y, size: 8, color: L.rgb(0, 0, 0) }); y -= 14; });
  }
}
const bytes = await doc.save();
let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
window.out = btoa(s); window.info = { errs: errs.length, w: (r[2] - r[0]).toFixed(0), h: (r[3] - r[1]).toFixed(0), rw };
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
page.on("console", (m) => console.log("console:", m.text()));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction("window.out", { timeout: 600000 });
const b64 = await page.evaluate(() => window.out);
if (b64.startsWith("ERR")) { console.log(b64); process.exit(1); }
await writeFile(out, Buffer.from(b64, "base64"));
console.log(out, Math.round(b64.length * 0.75 / 1024), "KB", JSON.stringify(await page.evaluate(() => window.info)));
await browser.close(); server.close();
