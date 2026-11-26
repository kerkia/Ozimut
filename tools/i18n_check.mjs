// The catalogues' check (owner, 2026-10-17: the site in French and English; German and Spanish since 2026-11-01).
// node tools/i18n_check.mjs [--strict] [--list]
//  - keys the code uses (t("…"), tn("…")) that the French catalogue lacks;
//  - French keys the English, German or Spanish catalogue lacks, keys of theirs French does not have;
//  - placeholders {x} and markup tags that differ between a key's French and its translation;
//  - French written in the code outside the catalogues (string and template literals with French words or accents),
//    except in the long texts written per language (*.fr.js, *.en.js, *.de.js, *.es.js), lines marked « i18n-ignore » and the N lines
//    after a comment « i18n-ignore-next N » (a pattern
//    matching French in documents, a name…); a file whose first lines say « i18n-ignore-file » is skipped whole.
// --strict exits 1 when anything is found; --list prints every finding, else the first ones of each kind.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const JS = join(ROOT, "site", "assets", "js");
const CAT = join(JS, "i18n");
const strict = process.argv.includes("--strict"), all = process.argv.includes("--list");

const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : []; });
const load = async (f) => (await import(pathToFileURL(join(CAT, f)).href)).default;

// the catalogues: fr.js / en.js / de.js / es.js and the areas' <area>.fr.js / <area>.en.js…
const LANGS = ["en", "de", "es"];
const FR = { ...(await load("fr.js")) }, TR = {};
for (const l of LANGS) TR[l] = { ...(await load(`${l}.js`)) };
for (const f of readdirSync(CAT)) {
  const m = /^([\w-]+)\.(fr|en|de|es)\.js$/.exec(f);
  if (m) Object.assign(m[2] === "fr" ? FR : TR[m[2]], await load(f));
}

const out = [];
const report = (title, items) => {
  out.push(`${title}: ${items.length}`);
  for (const x of all ? items : items.slice(0, 25)) out.push(`  ${x}`);
  if (!all && items.length > 25) out.push(`  … (${items.length - 25} more: --list)`);
};

// keys used by the code
// (js/chrono/ is Chronoz, a copy of its own repository with its own catalogues: checked there, tools/chrono_sync.mjs)
const files = walk(JS).filter((f) => !f.startsWith(CAT + sep) && !f.startsWith(join(JS, "chrono") + sep));
const used = new Set(), dynamic = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bt[n]?\(\s*"([^"]+)"/g)) {
    if (m[1].endsWith(".")) dynamic.push(`${relative(JS, f)}: ${m[1]}…`);   // a prefix completed at run time
    else used.add(m[1]);
  }
  for (const m of src.matchAll(/\bt[n]?\(\s*`([^`]*\$\{[^`]*)`/g)) dynamic.push(`${relative(JS, f)}: ${m[1]}`);
}
const plural = (k) => [`${k}.one`, `${k}.other`].some((x) => x in FR);
report("Keys used but missing in fr.js", [...used].filter((k) => !(k in FR) && !plural(k)).sort());

// each translation against French
const NAME = { en: "English", de: "German", es: "Spanish" };
const marks = (s, re) => [...String(s).matchAll(re)].map((m) => m[1]).sort().join(",");
for (const l of LANGS) {
  const T = TR[l];
  const missing = Object.keys(FR).filter((k) => !(k in T));
  const byPrefix = {};
  for (const k of missing) { const p = k.split(".")[0]; byPrefix[p] = (byPrefix[p] || 0) + 1; }
  report(`French keys missing in ${NAME[l]}`, all ? missing : Object.entries(byPrefix).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p}.* ${n}`));
  report(`${NAME[l]} keys not in French`, Object.keys(T).filter((k) => !(k in FR)));
  const diff = [];
  for (const k of Object.keys(T)) {
    if (!(k in FR)) continue;
    if (marks(FR[k], /\{(\w+)\}/g) !== marks(T[k], /\{(\w+)\}/g)) diff.push(`${k}: placeholders ${marks(FR[k], /\{(\w+)\}/g)} / ${marks(T[k], /\{(\w+)\}/g)}`);
    else if (marks(FR[k], /<\/?(\w+)/g) !== marks(T[k], /<\/?(\w+)/g)) diff.push(`${k}: tags ${marks(FR[k], /<\/?(\w+)/g)} / ${marks(T[k], /<\/?(\w+)/g)}`);
  }
  report(`Placeholders or tags that differ (${NAME[l]})`, diff);
}

// French written in the code
const FRENCH = /[àâçéèêëîïôûùüÿœÀÂÇÉÈÊËÎÏÔÛÙÜŒ«»]|\b(les|des|une|pour|avec|dans|sur|votre|vous|aucun|aucune|chargement|enregistr\w*|choisi\w*|fermer|annuler|valider|ajouter|supprimer|cliquez|déposez)\b/i;
const inline = [], typo = [];
for (const f of files) {
  if (/\.(fr|en|de|es)\.js$/.test(f)) continue;
  if (/[\\/]js[\\/]chrono[\\/]/.test(f)) continue;       // Chronoz: a copy of its own repository, checked there (tools/chrono_sync.mjs)
  const src = readFileSync(f, "utf8");
  if (/i18n-ignore-file/.test(src.slice(0, 600))) continue;
  const lines = src.split("\n");
  // a small lexer carried across lines: a stack of template literals and of the code in their ${…} (with its brace
  // depth); quoted strings and comments are read as code — nested templates (html`${xs.map((x) => html`…`)}`) included
  const stack = [];                       // "t" = a template's text, a number = code inside ${…} at that brace depth
  let block = false;                      // inside a /* … */ comment
  let ignore = 0;                         // lines left that a « i18n-ignore-next N » comment covers
  lines.forEach((line, i) => {
    const top = () => stack[stack.length - 1];
    const next = /i18n-ignore-next (\d+)/.exec(line);
    if (next) { ignore = +next[1]; return; }
    const covered = ignore > 0 && ignore--;
    if (!stack.length && !block && /^\s*(\/\/|\*)/.test(line)) return;   // a comment line
    const tplText = [];
    let buf = "", code = "", j = 0;
    while (j < line.length) {
      const c = line[j], n = line[j + 1];
      if (block) { if (c === "*" && n === "/") { block = false; j += 2; } else j++; continue; }
      if (top() === "t") {
        if (c === "\\") { buf += line.slice(j, j + 2); j += 2; continue; }
        if (c === "`") { stack.pop(); tplText.push(buf); buf = ""; j++; continue; }
        if (c === "$" && n === "{") { stack.push(0); tplText.push(buf); buf = ""; j += 2; continue; }
        buf += c; j++; continue;
      }
      if (c === "/" && n === "/") break;                          // a comment to the end of the line
      if (c === "/" && n === "*") { block = true; j += 2; continue; }
      if (c === '"' || c === "'") {                              // a quoted string, kept whole in the code
        let k = j + 1;
        while (k < line.length && line[k] !== c) k += line[k] === "\\" ? 2 : 1;
        code += line.slice(j, k + 1); j = k + 1; continue;
      }
      if (c === "/" && /(^|[(,=:[!&|?{};+\-*%<>~^]|\breturn|\btypeof)\s*$/.test(code)) {   // a regular expression
        let k = j + 1, cls = false;
        while (k < line.length && (cls || line[k] !== "/")) {
          if (line[k] === "\\") k++;
          else if (line[k] === "[") cls = true;
          else if (line[k] === "]") cls = false;
          k++;
        }
        code += " /re/ "; j = k + 1; continue;
      }
      if (c === "`") { stack.push("t"); code += " "; j++; continue; }
      if (typeof top() === "number") {
        if (c === "{") stack[stack.length - 1]++;
        else if (c === "}") { if (top() === 0) { stack.pop(); j++; continue; } stack[stack.length - 1]--; }
      }
      code += c; j++;
    }
    if (buf) tplText.push(buf);
    if (covered || /i18n-ignore/.test(line)) return;
    const lits = [...code.matchAll(/"((?:[^"\\]|\\.){2,})"|'((?:[^'\\]|\\.){2,})'/g)].map((m) => m[1] ?? m[2]).concat(tplText);
    for (const raw of lits) {
      const lit = raw.replace(/<[^>]*>/g, " ");
      // a key, an import path, a CSS rule or a regular expression is not text
      if (/^[\w.-]+$/.test(lit.trim()) || /^\.{0,2}\//.test(lit) || /[{};]\s*$/.test(lit.trim()) && !/[a-zà-ÿ]{3,} [a-zà-ÿ]{3,}/i.test(lit)) continue;
      if (FRENCH.test(lit)) { inline.push(`${relative(JS, f)}:${i + 1}: ${lit.trim().replace(/\s+/g, " ").slice(0, 90)}`); break; }
    }
    // French typography in a template's text, between placeholders the word test cannot read: « ${a} : ${b} »,
    // « ${n} % » — the language's own rules belong in the catalogue (a key with its placeholders)
    const t2 = tplText.find((x) => /\s[:;](\s|$)/.test(x.replace(/<[^>]*>/g, " ")) && !/^\s*[;:{}]\s*$/.test(x) || /^ %/.test(x));
    if (t2 != null && !inline.some((x) => x.startsWith(`${relative(JS, f)}:${i + 1}:`))) typo.push(`${relative(JS, f)}:${i + 1}: ${line.trim().slice(0, 110)}`);
  });
}
report("French written in the code", inline);
report("French typography in templates", typo);
if (dynamic.length) out.push(`(keys built at run time, not checked: ${dynamic.length})`);

console.log(out.join("\n"));
const bad = out.some((l) => /: [1-9]\d*$/.test(l));
process.exit(strict && bad ? 1 : 0);
