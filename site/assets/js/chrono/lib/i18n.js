// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Chrono's texts. They live in catalogues, one a language (../i18n/fr.js — the reference, where every key exists first —,
// en.js, de.js, es.js: the same keys, the same {placeholders}), read with t(key, vars) and tn(key, n) for counts (keys
// `x.one` / `x.other`). A text missing in a language falls back to English, then French.
//
// The language: the one the page that hosts Chrono says (<html lang>, set by a site Chrono is part of), else the one
// chosen here (?lang= in the address, the language menu of Chrono's own page: localStorage chronoz.lang), else the first
// of the browser's preferred languages Chrono has, English when it has none of them.
// The catalogues load before any module that imports this one runs (top-level await), so t() is synchronous everywhere.

export const LANGS = ["fr", "en", "de", "es"];
export const LANG_NAMES = { fr: "Français", en: "English", de: "Deutsch", es: "Español" };     // each in its own language
const LOCALES = { fr: "fr-FR", en: "en-GB", de: "de-DE", es: "es-ES" };
const KEY = "chronoz.lang";

function chosen() {
  if (typeof document === "undefined") return "en";                        // (tests under Node)
  const host = (document.documentElement.getAttribute("lang") || "").slice(0, 2).toLowerCase();
  if (LANGS.includes(host)) return host;
  try {
    const q = new URLSearchParams(location.search).get("lang");
    if (LANGS.includes(q)) localStorage.setItem(KEY, q);
    const v = localStorage.getItem(KEY);
    if (LANGS.includes(v)) return v;
  } catch (e) { /* no storage: the browser decides */ }
  const nav = (typeof navigator !== "undefined" && (navigator.languages?.length ? navigator.languages : [navigator.language])) || [];
  return nav.map((l) => String(l || "").slice(0, 2).toLowerCase()).find((l) => LANGS.includes(l)) || "en";
}

const UI = chosen();
const load = (l) => import(`../i18n/${l}.js`).then((m) => m.default);
// the reader's language, English beneath German and Spanish, French beneath all
const [FR, EN, LOC] = await Promise.all([load("fr"), UI === "fr" ? null : load("en"), UI === "fr" || UI === "en" ? null : load(UI)]);

/** The language the texts are in: "fr", "en", "de" or "es". */
export const lang = () => UI;
/** The locale numbers and dates are written in. */
export const locale = () => LOCALES[UI];
if (typeof document !== "undefined" && !document.documentElement.getAttribute("lang")) document.documentElement.lang = UI;

/** Change the language of Chrono's own page: kept on this device, then the page is drawn again. */
export function setLang(l) {
  if (!LANGS.includes(l)) return;
  try { localStorage.setItem(KEY, l); } catch (e) { /* this visit only */ }
  document.documentElement.removeAttribute("lang");
  const u = new URL(location.href);
  u.searchParams.delete("lang");
  location.replace(u.href);
}

const find = (key) => (LOC && LOC[key] != null ? LOC[key] : EN && EN[key] != null ? EN[key] : FR[key]);
/** Whether a key exists (in French, the reference). */
export const has = (key) => key in FR;

/** The text of `key` in the reader's language; `vars` fills its {placeholders}. */
export const t = (key, vars) => {
  const s = find(key);
  if (s == null) return key;
  if (!vars) return s;
  const out = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  // a text that opens on a placeholder opens with a capital, but in French (whose placeholders are written as they must read)
  return UI !== "fr" && s[0] === "{" ? out.charAt(0).toUpperCase() + out.slice(1) : out;
};

const plurals = new Intl.PluralRules(locale());
const numbers = new Intl.NumberFormat(locale());
/** A count's text: the key's plural form for n (key.one, key.other…; {n} is n written in the locale). */
export const tn = (key, n, vars = {}) => {
  const form = `${key}.${plurals.select(n)}`;
  return t(has(form) ? form : `${key}.other`, { n: numbers.format(n), ...vars });
};
