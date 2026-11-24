// The site's code as a deploy publishes it (2026-11-17; update.deploy runs this before wrangler). The pages are written and
// tried without any build step, and stay so: this only makes a copy that loads faster.
//
//   node tools/front_build.mjs --stamp <build> [--site site] [--out site]
//
// It writes, under <out>:
//   assets/v/<build>/js/…       the code as it is (assets/js copied), served « immutable » (site/_headers): a visit after the
//                               first asks the server for none of it. Every import is relative, so nothing in it changes.
//   assets/v/<build>/app.css    the stylesheet, likewise
//   …/js/i18n/gen/              the texts each reader needs and no more: core.<lang>.js (what the bar and the shared modules
//                               say), p.<page>.<lang>.js (a page's own, read from its modules), area.<name>.<lang>.js (an
//                               area's catalogues in one), all.<lang>.js (the whole main catalogue: the net under a text the
//                               reading missed). Each already holds the reader's language with English, then French, beneath.
//   …/js/gen/manifest.js        route -> page, and each page's modules: the router asks for them all at once
//   index.html                  the page pointing at that copy, the reader's texts and the first modules asked for at once
// Nothing else of <out> is touched; <site> is only read (update.deploy puts index.html back after the upload). The same
// sources and the same <build> give the same bytes.
import fs from "node:fs";
import path from "node:path";

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : dflt; };
const SITE = path.resolve(arg("site", "site"));
const OUT = path.resolve(arg("out", SITE));
const BUILD = arg("stamp", "");
if (!/^[0-9a-f]{8,40}$/.test(BUILD)) { console.error("front build: --stamp <hex> is required"); process.exit(2); }
const JS = path.join(SITE, "assets", "js");
const LANGS = ["fr", "en", "de", "es"];
const posix = (p) => p.split(path.sep).join("/");

// ---- the modules ------------------------------------------------------------------------------------------------------
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p); else files.push(posix(path.relative(JS, p)));
  }
})(JS);
const modules = new Set(files.filter((f) => f.endsWith(".js")));
const text = new Map();
const read = (m) => { if (!text.has(m)) text.set(m, fs.readFileSync(path.join(JS, m), "utf8")); return text.get(m); };

const RE_STATIC = /(?:^|\n)\s*(?:import|export)\s+(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g;
const RE_DYN = /\bimport\(\s*(["'`])((?:(?!\1)[^\\\n])+)\1\s*\)/g;
const resolve = (from, spec) => posix(path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)));
/** A module's imports: the static ones, and (dyn) those it asks for later — « ./games/${name}.js » as every file it fits. */
function imports(m, dyn) {
  const s = read(m), out = [];
  let x;
  RE_STATIC.lastIndex = 0;
  while ((x = RE_STATIC.exec(s))) if (x[1].startsWith(".")) out.push(resolve(m, x[1]));
  if (dyn) {
    RE_DYN.lastIndex = 0;
    while ((x = RE_DYN.exec(s))) {
      if (!x[2].startsWith(".")) continue;
      if (!x[2].includes("${")) { out.push(resolve(m, x[2])); continue; }
      const parts = x[2].split(/\$\{[^}]*\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      const re = new RegExp(`^${resolve(m, parts.join("\u0001")).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").split("\u0001").join("[\\w.-]+")}$`);
      for (const f of modules) if (re.test(f)) out.push(f);
    }
  }
  return out.filter((f) => modules.has(f));
}
function closure(entries, dyn, stop) {
  const seen = new Set(entries), q = [...entries];
  while (q.length) for (const d of imports(q.shift(), dyn)) if (!seen.has(d) && !(stop && stop.has(d))) { seen.add(d); q.push(d); }
  return seen;
}

// what every visit loads: app.js and what it imports
const boot = closure(["app.js"], false);
// the pages: app.js `route: () => import("./pages/x.js")`
const routes = {};
{
  let x;
  const re = /^\s*(\w+):\s*\(\)\s*=>\s*import\("\.\/(pages\/[\w-]+\.js)"\)/gm;
  while ((x = re.exec(read("app.js")))) routes[x[1]] = x[2];
}
const pageFiles = [...new Set(Object.values(routes))].sort();
if (pageFiles.length < 20) { console.error("front build: the pages were not found in app.js"); process.exit(1); }
const pageName = (f) => f.replace(/^pages\//, "").replace(/\.js$/, "");
// what the shared modules ask for later that is no page (the move's window, the notifications…): its texts are the core's
const pageSet = new Set(pageFiles);
const bootLater = closure([...boot].flatMap((m) => imports(m, true)).filter((m) => !boot.has(m) && !pageSet.has(m) && !/^i18n\//.test(m)), true, boot);

// ---- the texts --------------------------------------------------------------------------------------------------------
const catalogue = (f) => {
  const p = path.join(JS, "i18n", f);
  if (!fs.existsSync(p)) return null;
  const s = fs.readFileSync(p, "utf8");
  const i = s.indexOf("export default");
  if (i < 0) throw new Error(`${f}: no « export default »`);
  return new Function(`return ${s.slice(i + "export default".length).replace(/;\s*$/, "")}`)();
};
const MAIN = Object.fromEntries(LANGS.map((l) => [l, catalogue(`${l}.js`)]));
const areas = [...new Set(fs.readdirSync(path.join(JS, "i18n")).map((f) => /^([\w-]+)\.fr\.js$/.exec(f)?.[1]).filter(Boolean))].sort();
/** A catalogue as a reader of `lang` gets it: their language, English beneath German and Spanish, French beneath all. */
const merged = (get, lang, keys) => {
  const fr = get("fr") || {}, en = lang === "fr" ? null : get("en"), own = lang === "fr" || lang === "en" ? null : get(lang);
  const out = {};
  for (const k of keys || Object.keys(fr)) {
    const v = own && own[k] != null ? own[k] : en && en[k] != null ? en[k] : fr[k];
    if (v != null) out[k] = v;
  }
  return out;
};

// The keys a module names. A text's key is written in the code as a string (« agd.count »), or begun there and finished at
// run time (`agd.when.${w}`, "err." + code): a string that is a key, or that keys start with, counts for all of them.
const KEYS = Object.keys(MAIN.fr).sort();
const prefixes = [...new Set(KEYS.map((k) => k.split(".")[0]))].sort((a, b) => b.length - a.length);
const RE_KEY = new RegExp(`(["'\`])((?:${prefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\.[\\w.-]*)`, "g");
const stemCache = new Map();
function keysFrom(stem, whole) {
  const id = `${whole ? 1 : 0}${stem}`;
  if (stemCache.has(id)) return stemCache.get(id);
  let out;
  if (whole) {
    // a whole string: the key itself and its forms (« agd.count » -> agd.count.one, .other); when it is neither, what starts with it
    out = KEYS.filter((k) => k === stem || k.startsWith(`${stem}.`));
    if (!out.length) out = KEYS.filter((k) => k.startsWith(stem));
  } else out = KEYS.filter((k) => k.startsWith(stem));
  stemCache.set(id, out);
  return out;
}
const moduleKeys = new Map();
function keysOf(m) {
  if (moduleKeys.has(m)) return moduleKeys.get(m);
  const s = read(m), out = new Set();
  let x;
  RE_KEY.lastIndex = 0;
  while ((x = RE_KEY.exec(s))) {
    const whole = s[RE_KEY.lastIndex] === x[1] && !x[2].endsWith(".");
    for (const k of keysFrom(x[2], whole)) out.add(k);
  }
  moduleKeys.set(m, out);
  return out;
}
const keysOfAll = (mods) => { const out = new Set(); for (const m of mods) if (!/^i18n\//.test(m)) for (const k of keysOf(m)) out.add(k); return out; };

const core = keysOfAll([...boot, ...bootLater]);
// a key no module names is built wholly at run time, or unused: with the core, so that it is always there
const named = new Set(core);
const pages = {};
for (const f of pageFiles) {
  const all = closure([f], true, boot);
  const keys = [...keysOfAll(all)].filter((k) => !core.has(k)).sort();
  for (const k of keys) named.add(k);
  pages[pageName(f)] = { file: f, keys, mods: [...closure([f], false, boot)].filter((m) => m !== f && !/^i18n\//.test(m)).sort() };
}
const orphans = KEYS.filter((k) => !named.has(k));
for (const k of orphans) core.add(k);

// ---- written ----------------------------------------------------------------------------------------------------------
const V = path.join(OUT, "assets", "v");
const DEST = path.join(V, BUILD);
fs.rmSync(V, { recursive: true, force: true });                   // one copy at a time: the build before goes
fs.mkdirSync(path.join(DEST, "js", "i18n", "gen"), { recursive: true });
fs.mkdirSync(path.join(DEST, "js", "gen"), { recursive: true });
for (const f of files) {
  const to = path.join(DEST, "js", f);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(JS, f), to);
}
// a file a module reads beside the code (new URL("../geo/regions.json", import.meta.url)): at the same place beside the copy
for (const m of modules) {
  let x;
  const re = /new URL\(\s*["'](\.\.\/[^"'$]+)["']\s*,\s*import\.meta\.url\s*\)/g;
  while ((x = re.exec(read(m)))) {
    const rel = resolve(`js/${m}`, x[1]);
    const from = path.join(SITE, "assets", rel);
    if (rel.startsWith("js/") || rel.startsWith("..") || !fs.existsSync(from)) continue;
    fs.mkdirSync(path.dirname(path.join(DEST, rel)), { recursive: true });
    fs.copyFileSync(from, path.join(DEST, rel));
  }
}
fs.copyFileSync(path.join(SITE, "assets", "app.css"), path.join(DEST, "app.css"));

const emit = (name, obj) => fs.writeFileSync(path.join(DEST, "js", "i18n", "gen", name), `export default ${JSON.stringify(obj)};\n`);
const sizes = {};
for (const l of LANGS) {
  const main = (x) => MAIN[x];
  emit(`core.${l}.js`, merged(main, l, [...core].sort()));
  emit(`all.${l}.js`, merged(main, l));
  for (const [name, p] of Object.entries(pages)) emit(`p.${name}.${l}.js`, merged(main, l, p.keys));
  for (const a of areas) emit(`area.${a}.${l}.js`, merged((x) => catalogue(`${a}.${x}.js`), l));
  sizes[l] = fs.statSync(path.join(DEST, "js", "i18n", "gen", `core.${l}.js`)).size;
}
const manifest = {
  build: BUILD,
  routes: Object.fromEntries(Object.entries(routes).map(([r, f]) => [r, pageName(f)])),
  pages: Object.fromEntries(Object.entries(pages).map(([name, p]) => [name, { file: p.file, mods: p.mods }])),
  areas,
};
fs.writeFileSync(path.join(DEST, "js", "gen", "manifest.js"), `export default ${JSON.stringify(manifest)};\n`);

// ---- the page ---------------------------------------------------------------------------------------------------------
let html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const base = `assets/v/${BUILD}`;
const swap = (from, to) => { if (!html.includes(from)) throw new Error(`index.html: « ${from} » not found`); html = html.split(from).join(to); };
swap('href="assets/app.css"', `href="${base}/app.css"`);
const preloads = [...boot].filter((m) => m !== "app.js").sort().concat(["gen/manifest.js", "front.js"].filter((m) => !boot.has(m) && (m.startsWith("gen/") || modules.has(m))));
const head = `<script>
    // this deploy's copy of the code (tools/front_build.mjs): its texts in the reader's language and its first modules, asked
    // for at once — the language as i18n.js chooses it
    window.__oz = { v: "${BUILD}", i18n: 1 };
    // (2026-11-24: Firefox stayed on « Chargement… » — two modules of this copy came back as the site's page, kept so by
    // Cloudflare: a browser asked for them while the deploy was reaching it and the deployment before answered) the copy's
    // first modules failing to load, the code as written is loaded instead (assets/js, asked again at each visit)
    window.__ozFallback = () => {
      if (window.__ozFell) return;
      window.__ozFell = 1;
      window.__oz = null;
      const s = document.createElement("script");
      s.type = "module";
      s.src = "assets/js/app.js";
      document.head.appendChild(s);
    };
    (() => {
      const LG = ["fr", "en", "de", "es"];
      let lg = null;
      try {
        lg = new URLSearchParams(location.search).get("lang") || new URLSearchParams(location.hash.split("?")[1] || "").get("lang") || localStorage.getItem("ocn.lang");
      } catch (e) {}
      if (lg === "xx") lg = "fr";
      if (!LG.includes(lg)) lg = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).map((l) => String(l || "").slice(0, 2).toLowerCase()).find((l) => LG.includes(l)) || "en";
      let full = false;
      try { full = sessionStorage.getItem("ocn.i18n.full") === "${BUILD}"; } catch (e) {}
      const l = document.createElement("link");
      l.rel = "modulepreload";
      l.href = "${base}/js/i18n/gen/" + (full ? "all." : "core.") + lg + ".js";
      document.head.appendChild(l);
    })();
  </script>
${[...new Set(preloads)].map((m) => `  <link rel="modulepreload" href="${base}/js/${m}">`).join("\n")}
  <script type="module" src="${base}/js/app.js" onerror="__ozFallback()"></script>`;
swap('<script type="module" src="assets/js/app.js"></script>', head);
fs.writeFileSync(path.join(OUT, "index.html"), html);

const kb = (n) => `${Math.round(n / 1024)} KB`;
const pageSizes = Object.entries(pages).map(([n, p]) => [n, p.keys.length]).sort((a, b) => b[1] - a[1]);
console.log(`front build ${BUILD}: ${files.length} files, ${pageFiles.length} pages, ${areas.length} areas; texts: ${KEYS.length} keys, core ${core.size} (${LANGS.map((l) => `${l} ${kb(sizes[l])}`).join(", ")}), ${orphans.length} named by no module; largest pages ${pageSizes.slice(0, 5).map(([n, k]) => `${n} ${k}`).join(", ")}`);
