// The purchase gate's commit check (docs/app/design.md; owner, 2026-11-23): everything about prices, plans and buying is
// drawn by site/assets/js/offers.js from the catalogue area i18n/billing.<lang>.js, and by nothing else — so that the Ozimut
// app, where offers.js draws nothing, can never show an invitation to buy. Run by tools/git-hooks/pre-commit on the files as
// they will be committed; by hand: node tools/offer_check.mjs [--list]. It fails when
//   1. a bill.* key, the « billing » area, a checkout host or /api/billing is named outside offers.js;
//   2. a selling word appears in a text of another catalogue or of a page's code, unless its key or file is allowed below
//      (payments for real-world services between people and clubs — race entries, club accounts —, the administrators'
//      figures, a watch's mobile plan, other companies' prices on « IA », which no phone shows).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const JS = join(ROOT, "site", "assets", "js");
const list = process.argv.includes("--list");

// the gate itself
const GATE = new Set(["offers.js", "i18n/billing.fr.js", "i18n/billing.en.js", "i18n/billing.de.js", "i18n/billing.es.js"]);
// not the site's interface: other people's code, the deploy's generated copies, Ozimut Chrono's copy (an organiser's desk tool)
const SKIP = [/^vendor\//, /^gen\//, /^i18n\/gen\//, /^chrono\//];

// 1. what only the gate may name
const GATED = [
  [/["'`]bill\.[a-z]/, "a bill.* key"],
  [/loadArea\(\s*["'`]billing["'`]\s*\)|i18n\/billing\./, "the billing area"],
  [/api\/billing\b/, "/api/billing"],
  [/\b(checkout|buy|billing|pay)\.stripe\.com|\bpaddle\.com|\blemonsqueezy\.com|\bpaypal\.com/, "a checkout host"],
];

// 2. selling words, by language (a catalogue's language from its file name; code and French content: all of them)
const WORDS = {
  fr: /\babonnements?\b|s[’']abonner|\babonnez|\bpayante?s?\b|\btarifs?\b|\bprix\b|\bachat\b|\bacheter\b|€|\boffre (plus|premium)\b/i,
  en: /\bsubscriptions?\b|\bsubscribe\b|\bpricing\b|\bpaid\b|\bupgrade\b|\bpurchase\b|\bbuy\b|\bpremium\b|€|\bfees?\b/i,
  de: /\babonnements?\b|\babonnieren\b|kostenpflichtig|\bpreise?\b|\bkaufen\b|\bupgrade\b|\bpremium\b|€|\bgebühr/i,
  es: /\bsuscripci[oó]n|\bsuscr[ií]b|\bde pago\b|\bprecios?\b|\bcomprar\b|\bcompra\b|\btarifas?\b|\bpremium\b|€/i,
};
// keys allowed to hold such a word, by prefix, each with its reason
const ALLOW_KEYS = [
  [/^(ent|eo|acc|bk|cl|club|org)\./, "race entries and the clubs' accounts: payments for real-world services, outside Ozimut"],
  [/^(ad|admin)\./, "the administrators' pages: the site's own costs"],
  [/^(ia|byok)\./, "« IA »: other companies' models; not offered on a phone"],
  [/^trk\.watch\./, "a watch's mobile plan, sold by a phone operator"],
  [/^mg\.kind\./, "an event's kind: a public training « often paid » at its desk"],
  [/^(vo|vt)\./, "Pixel's texts: nothing sold"],
  [/^trc\./, "the Tracer: an event's own entry fees and classes"],
  [/^(pv|st\.del|ct)\./, "the rules and contact pages"],
];
// files whose long texts may hold such a word
const ALLOW_FILES = [
  [/^content\/guide\./, "the guides: how organisers set their own races' fees"],
  [/^content\/privacy\./, "the rules: the services' free tiers Ozimut runs on; the paragraph on paid features comes from offers.js"],
  [/^content\/(vma|methods|orgdirect|chronoapp)\./, "documentation: free third-party applications, the method's texts"],
  [/^i18n\/(entries|accounts|club|orgmaps|manage)\./, "race entries, clubs and their accounts"],
  [/^pages\/(entry|entriesorg|clubaccounts|adminclubs|admin\w*|ask|consumption)\.js$/, "entries, clubs, administrators, « IA »"],
  [/^(entryprice|bankstatement|askbyok)\.js$/, "entry prices, bank statements, « IA »"],
  [/^tracer\//, "the Tracer's own event data"],
];

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* walk(p); else if (n.endsWith(".js")) yield p;
  }
}
const problems = [];
const say = (file, line, what, text) => problems.push(`  ${file}:${line}: ${what}${text ? ` — ${text.trim().slice(0, 110)}` : ""}`);

for (const path of walk(JS)) {
  const file = relative(JS, path).split(sep).join("/");
  if (GATE.has(file) || SKIP.some((re) => re.test(file))) continue;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  const cat = /^i18n\/(?:[\w-]+\.)?(fr|en|de|es)\.js$/.exec(file), content = /^content\/[\w-]+\.(fr|en|de|es)\.js$/.exec(file);
  const fileOk = ALLOW_FILES.some(([re]) => re.test(file));
  lines.forEach((ln, i) => {
    if (/offer-ok/.test(ln)) return;                                  // a line marked as looked at (say why beside it)
    const code = ln.replace(/^\s*\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    for (const [re, what] of GATED) if (re.test(code)) say(file, i + 1, `${what} named outside offers.js`, ln);
    if (fileOk) return;
    if (cat) {
      // a catalogue: each "key": "text" of the line
      for (const m of ln.matchAll(/"((?:[^"\\]|\\.)+)":\s*"((?:[^"\\]|\\.)*)"/g)) {
        if (WORDS[cat[1]].test(m[2]) && !ALLOW_KEYS.some(([re]) => re.test(m[1]))) say(file, i + 1, `a selling word in « ${m[1]} »`, m[2]);
      }
    } else if (content) {
      if (WORDS[content[1]].test(code.replace(/<[^>]+>/g, " "))) say(file, i + 1, "a selling word in a long text", ln);
    }
  });
}

if (problems.length) {
  console.log(`The purchase gate (docs/app/design.md): ${problems.length} thing(s) about buying outside site/assets/js/offers.js`);
  for (const p of list ? problems : problems.slice(0, 40)) console.log(p);
  if (!list && problems.length > 40) console.log(`  … ${problems.length - 40} more (--list)`);
  console.log("Move the text to i18n/billing.<lang>.js and draw it from offers.js; or, if it sells nothing of Ozimut's, allow its key or file in tools/offer_check.mjs with the reason.");
  process.exit(1);
}
console.log("The purchase gate: nothing about buying outside offers.js.");
