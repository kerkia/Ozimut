// The interface's language (owner, 2026-10-17: the site globalised, French and English first; German and Spanish since
// 2026-11-01). The texts live in catalogues — i18n/fr.js, the reference where every key exists first, i18n/en.js,
// de.js, es.js —, plus an area's own catalogues loaded by its pages (loadArea: i18n/<area>.fr.js, <area>.en.js…; the
// Tracer's). Long texts (the documentation, the guides, the legal pages) are whole modules per language, not keys. A text
// missing in German or Spanish falls back to English, then French; one missing in English to French.
//
// The language: the one chosen (localStorage ocn.lang — the language menu beside the theme, on every page, Réglages, the
// registration form; ?lang= in an address; a signed-in account's own at login on a device that has none), else the
// browser's: the first of its preferred languages the site has, English when it has none of them. « xx » is a test pseudo-language:
// French texts transformed, so that any text not drawn through t() stands out (?lang=xx).
// The catalogues load before any module that imports this one runs (top-level await), so t() is synchronous everywhere.

export const LANGS = ["fr", "en", "de", "es"];
export const LANG_NAMES = { fr: "Français", en: "English", de: "Deutsch", es: "Español" };     // each in its own language (i18n-ignore)
const LOCALES = { fr: "fr-FR", en: "en-GB", de: "de-DE", es: "es-ES" };
const KEY = "ocn.lang";
// false while the English was being written (French unless chosen, the switch for administrators only); true since
// 2026-10-18 (owner): the browser's language decides, everyone has the switch.
export const OPEN = true;

function chosen() {
  try {
    const q = new URLSearchParams(location.search).get("lang") || new URLSearchParams(location.hash.split("?")[1] || "").get("lang");
    if (q && (LANGS.includes(q) || q === "xx")) localStorage.setItem(KEY, q);
    const v = localStorage.getItem(KEY);
    if (v && (LANGS.includes(v) || v === "xx")) return v;
  } catch (e) { /* no storage: the browser decides */ }
  if (!OPEN) return "fr";
  const nav = (typeof navigator !== "undefined" && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
  if (!nav.length) return "fr";
  const first = nav.map((l) => String(l || "").slice(0, 2).toLowerCase()).find((l) => LANGS.includes(l));
  return first || "en";
}

const UI = chosen();
const L = LANGS.includes(UI) ? UI : "fr";

// A deploy publishes the texts cut to what each page says (2026-11-17, tools/front_build.mjs; index.html then sets
// window.__oz): one file for the bar and the shared modules (core.<lang>.js), one a page (p.<page>.<lang>.js, loadPage — the
// router asks for it before the page's module runs), one an area (area.<name>.<lang>.js, loadArea), each already holding the
// reader's language with English then French beneath: one table, FR. A text asked for that none of them brought (its key
// built in a way the build could not read) loads the whole catalogue once (all.<lang>.js) and says so (« ocn:i18n-late »:
// app.js draws the page again and reports the key); that visit then starts from the whole catalogue. Without a build — the
// local server — the catalogues are read whole as they are written, below.
const OZ = typeof window !== "undefined" && window.__oz?.i18n ? window.__oz : null;
const GEN = "./i18n/gen/";
const HAVE = new Set();                    // the prefixes (« agd », « nav ») whose texts are loaded
const note = (table) => { for (const k in table) { const i = k.indexOf("."); HAVE.add(i < 0 ? k : k.slice(0, i)); } };
let MERGED = false, FULL = false, FR = null, OWN = null, ENX = null;
if (OZ) {
  try {
    try { FULL = sessionStorage.getItem("ocn.i18n.full") === OZ.v; } catch (e) { /* no storage: the core */ }
    FR = { ...(await import(`${GEN}${FULL ? "all" : "core"}.${L}.js`)).default };
    note(FR);
    MERGED = true;
  } catch (e) { FULL = false; }             // (a deploy without them: as the local server)
}
if (!MERGED) {
  // the catalogues fetched together (owner, 2026-11-06: one after the other, a German or Spanish reader's launch waited for
  // three files of ~350 KB in turn)
  [FR, OWN, ENX] = await Promise.all([
    import("./i18n/fr.js").then((m) => m.default),
    LANGS.includes(UI) && UI !== "fr" ? import(`./i18n/${UI}.js`).then((m) => m.default) : null,
    LANGS.includes(UI) && UI !== "fr" && UI !== "en" ? import("./i18n/en.js").then((m) => m.default) : null,
  ]);
}
// the language's own catalogue, and English beneath German and Spanish (none of them apart in a deploy's merged tables)
const EN = MERGED ? null : UI === "en" ? OWN : OWN ? ENX : null;
const LOC = MERGED ? null : UI === "en" ? null : OWN;

// a text missing from the tables loaded: the whole catalogue, once
const MISSED = [];
let lateP = null;
function late(key) {
  if (!MERGED || FULL) return;
  if (MISSED.length < 20 && !MISSED.includes(key)) MISSED.push(key);
  lateP ||= import(`${GEN}all.${L}.js`).then((m) => {
    for (const k in m.default) if (!(k in FR)) FR[k] = m.default[k];
    note(m.default);
    FULL = true;
    try { sessionStorage.setItem("ocn.i18n.full", OZ.v); } catch (e) { /* this page only */ }
    window.dispatchEvent(new CustomEvent("ocn:i18n-late", { detail: MISSED.slice() }));
  }).catch(() => {});
}
/** A key the tables lack: missing for good when its prefix's texts are loaded, else not brought yet (-> late). */
const absent = (key) => {
  if (!MERGED || FULL) return;
  const i = key.indexOf(".");
  if (!HAVE.has(i < 0 ? key : key.slice(0, i))) late(key);
};

/** A page's own texts (its file's name, « agenda »): loaded before its module runs. Nothing to do without a build. */
const pagesLoaded = new Map();
export function loadPage(name) {
  if (!MERGED || FULL || !name) return Promise.resolve();
  if (!pagesLoaded.has(name)) {
    pagesLoaded.set(name, import(`${GEN}p.${name}.${L}.js`).then((m) => { Object.assign(FR, m.default); note(m.default); })
      .catch(() => { late(`page:${name}`); return lateP; }));
  }
  return pagesLoaded.get(name);
}

/** The catalogue files a page and its areas read, as addresses (the Tracer's and the map editor's copies for work offline). */
export function catalogueFiles(page, areaNames = []) {
  const u = (p) => new URL(p, import.meta.url).href;
  return MERGED
    ? [u(`${GEN}core.${L}.js`), u(`${GEN}all.${L}.js`), ...(page ? [u(`${GEN}p.${page}.${L}.js`)] : []), ...areaNames.map((a) => u(`${GEN}area.${a}.${L}.js`))]
    : [...LANGS.map((l) => u(`./i18n/${l}.js`)), ...areaNames.flatMap((a) => LANGS.map((l) => u(`./i18n/${a}.${l}.js`)))];
}

/** The language the texts are in: "fr", "en", "de" or "es" (the pseudo-language formats as French). */
export const lang = () => (LANGS.includes(UI) ? UI : "fr");
/** The language as chosen, the pseudo-language included. */
export const uiLang = () => UI;
/** The locale numbers and dates are written in. */
export const locale = () => LOCALES[lang()];
if (typeof document !== "undefined") document.documentElement.lang = lang();

/** Change the language: kept on this device (and on the account, by the caller), then the page is drawn again. */
export function setLang(l) {
  if (!LANGS.includes(l) && l !== "xx") return;
  try { localStorage.setItem(KEY, l); } catch (e) { /* this visit only */ }
  location.reload();
}

/** The language chosen on this device (the menu, Réglages, ?lang=), or null when none was: the browser's decides. */
export function storedLang() {
  try { const v = localStorage.getItem(KEY); return LANGS.includes(v) ? v : null; } catch (e) { return null; }
}

/** At login: the account's language, unless this device has a choice of its own; true when the page must be drawn
 *  again in it (the caller reloads). */
export function adoptLang(l) {
  try {
    if (!LANGS.includes(l) || l === UI || localStorage.getItem(KEY)) return false;
    localStorage.setItem(KEY, l);
    return true;
  } catch (e) { return false; }
}

/** Load an area's catalogues (i18n/<area>.fr.js and the language's, <area>.en.js…) into the tables; once. */
const areas = new Map();
export function loadArea(name) {
  if (!areas.has(name)) {
    // the three fetched together (they came one after the other: three round trips before an area's page could draw)
    areas.set(name, (async () => {
      if (MERGED) {
        // (a deploy's: the area's catalogues in one file, the reader's language over English over French)
        try { const m = await import(`${GEN}area.${name}.${L}.js`); Object.assign(FR, m.default); note(m.default); return; } catch (e) { /* as written, below */ }
      }
      const [fr, en, loc] = await Promise.all([import(`./i18n/${name}.fr.js`),
        EN ? import(`./i18n/${name}.en.js`).catch(() => null) : null,        // French then
        LOC ? import(`./i18n/${name}.${UI}.js`).catch(() => null) : null]);  // English then
      if (MERGED) {
        // (the table is one: the area's French, then its English, then the reader's language over them)
        const own = { ...fr.default, ...(L !== "fr" ? (await import(`./i18n/${name}.en.js`).catch(() => null))?.default : null),
          ...(L !== "fr" && L !== "en" ? (await import(`./i18n/${name}.${L}.js`).catch(() => null))?.default : null) };
        Object.assign(FR, own);
        note(own);
        return;
      }
      Object.assign(FR, fr.default);
      if (EN && en) Object.assign(EN, en.default);
      if (LOC && loc) Object.assign(LOC, loc.default);
    })());
  }
  return areas.get(name);
}

/** Whether a key exists (in French, the reference). */
export const has = (key) => (key in FR ? true : (absent(key), false));

// the pseudo-language: letters accented, placeholders, tags and entities left alone, the whole bracketed
const PSEUDO = { a: "á", e: "é", i: "í", o: "ö", u: "ü", c: "ç", n: "ñ", A: "Á", E: "É", I: "Í", O: "Ö", U: "Ü", C: "Ç", N: "Ñ" };
const pseudo = (s) => `⟦${s.split(/(\{\w+\}|<[^>]*>|&\w+;)/).map((p, i) => (i % 2 ? p : p.replace(/[a-zA-Z]/g, (c) => PSEUDO[c] || c))).join("")}⟧`;

// Placeholders a text may use without its caller giving them: the words for the value of the method the site shows
// ({cnPl} « indices Ozimut », {cnTo} « à l'indice »…: ui.cnWords), registered by app.js (setDefaults).
let DEFAULTS = null;
export const setDefaults = (fn) => { DEFAULTS = fn; };

/** The text of `key` in the interface's language; `vars` fills its {placeholders}. */
export const t = (key, vars) => {
  let s = LOC && LOC[key] != null ? LOC[key] : EN && EN[key] != null ? EN[key] : FR[key];
  if (s == null) { absent(key); return key; }
  if (UI === "xx") s = pseudo(s);
  if (DEFAULTS && s.includes("{cn")) vars = { ...DEFAULTS(), ...vars };
  if (!vars) return s;
  const out = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  // an English (German, Spanish) text that opens on a placeholder (« {cn} history ») opens with a capital (« Official CN history »)
  return UI !== "fr" && UI !== "xx" && s[0] === "{" ? out.charAt(0).toUpperCase() + out.slice(1) : out;
};

const plurals = new Intl.PluralRules(locale());
const numbers = new Intl.NumberFormat(locale());
/** A count's text: the key's plural form for n (key.one, key.other…; {n} is n written in the locale). */
export const tn = (key, n, vars = {}) => {
  const form = `${key}.${plurals.select(n)}`;
  return t(form in FR || (EN && form in EN) || (LOC && form in LOC) ? form : `${key}.other`, { n: numbers.format(n), ...vars });
};
