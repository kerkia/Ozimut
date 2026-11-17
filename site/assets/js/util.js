// Shared helpers.

import { t, has, lang, locale } from "./i18n.js";

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => (v == null ? "" : String(v).replace(/[&<>"']/g, (c) => ESC[c]));

// Trusted markup marker for the html`` template below.
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s == null ? "" : String(s));

/**
 * Tagged template that escapes every interpolation unless wrapped in raw().
 * Names, clubs and titles come from scraped pages, so nothing reaches
 * innerHTML without going through here.
 */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) {
    out += render(vals[i]) + strings[i + 1];
  }
  return raw(out);
}
function render(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join("");
  if (v == null || v === false) return "";
  return esc(v);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function mount(el, content) {
  el.innerHTML = content instanceof Raw ? content.s : esc(content);
  return el;
}

// ---- numbers & dates ------------------------------------------------------
// numbers and dates in the interface's language (i18n.locale: fr-FR, en-GB, de-DE or es-ES)
// The formatters are made once each and kept (2026-11-17): toLocaleString with options builds a new one at every call —
// measured in Chrome 0.07 ms a number and 0.32 ms a date, against 0.002 and 0.005 kept —, and a list of 2 000 rows drawn
// again at each tick of a filter spent most of its time there.
const NUMBERS = new Map(), DATES = new Map();
function numberFormat(digits) {
  const k = `${locale()}|${digits}`;
  let f = NUMBERS.get(k);
  if (!f) NUMBERS.set(k, f = new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits }));
  return f;
}
/** A date and time formatter for these options, made once and kept (as the two above: a page's clock, a replay's, a list's
 *  rows asked for a new one at each call). `loc`: a locale, the interface's by default. */
const FORMATS = new Map();
export function dateFormat(opts, loc = locale()) {
  const k = `${loc}|${JSON.stringify(opts)}`;
  let f = FORMATS.get(k);
  if (!f) FORMATS.set(k, f = new Intl.DateTimeFormat(loc, opts));
  return f;
}
export const fmt = (n, digits = 0) =>
  n == null || Number.isNaN(n) ? "—" : numberFormat(digits).format(Number(n));
/** An ordinal: 1er, 2e, 3e… in French; 1st, 2nd, 3rd, 4th… in English; 1., 2. in German; 1.º, 2.º in Spanish. */
const EN_ORD = new Intl.PluralRules("en-GB", { type: "ordinal" });
const EN_SUFFIX = { one: "st", two: "nd", few: "rd", other: "th" };
export const ord = (n) => (n == null ? "—" : lang() === "en" ? `${fmt(n)}${EN_SUFFIX[EN_ORD.select(n)]}` : lang() === "de" ? `${fmt(n)}.`
  : lang() === "es" ? `${fmt(n)}.º` : n === 1 ? "1er" : `${fmt(n)}e`);
/** "1 victoire" / "3 victoires": the plural from 2 up in French, for anything but 1 in English, German, Spanish (0 races). */
export const plural = (n, one, many) => `${fmt(n)} ${(lang() !== "fr" ? Math.abs(n) !== 1 : Math.abs(n) >= 2) ? many : one}`;
// the sex letters of FFCO's classes in each language: H / D in French and German (Herren / Damen), M / W in English,
// M / F in Spanish (masculino / femenino, as FEDO writes them)
const SEX = { en: { H: "M", D: "W" }, es: { H: "M", D: "F" } };
/** An FFCO class as shown: « H21 », « D16 » in French and German; « M21 », « W16 » in English (owner, 2026-10-17);
 *  « M21 », « F16 » in Spanish. */
export const fmtCat = (c) => (c && SEX[lang()] ? String(c).replace(/^([HD])(?=\d|$|\s)/, (m) => SEX[lang()][m]) : c ?? "");
/** A format or discipline of FFCO's data as shown: itself in French; in the other languages word by word through the
 *  catalogue's « format.<word> » (Nuit -> Night, Pédestre -> Foot, VTT MD -> MTB MD), unknown words kept. */
export const fmtFormat = (s) => (s && lang() !== "fr"
  ? String(s).replace(/[\p{L}']+/gu, (w) => (has(`format.${w}`) ? t(`format.${w}`) : w)).replace(/\s{2,}/g, " ").trim() : s ?? "");
/** A French region of the data as shown: its name, but for the overseas départements grouped under one word in France's
 *  agenda (ffco_scraper/agenda.py OUTRE_MER), worded in the reader's language. */
const OVERSEAS = "Outre-mer";                                       // the data's value (i18n-ignore)
/** FFCO's competition type (the agenda's « manif », « Régionale Moyenne Distance »…) in the reader's language: the whole
 *  phrase from the catalogue's « manif.<phrase> », else word by word as fmtFormat. */
export const fmtManif = (s) => (!s || lang() === "fr" ? s ?? "" : has(`manif.${s}`) ? t(`manif.${s}`) : fmtFormat(s));
export const fmtRegion = (r) => (r === OVERSEAS ? t("region.overseas") : r ?? "");
/** The sex letter of a class as shown: H / D in French and German, M / W in English, M / F in Spanish. */
export const fmtSex = (x) => (SEX[lang()]?.[x] || x);
export const fmtSigned =(n) => (n == null ? "—" : (n > 0 ? "+" : n < 0 ? "−" : "±") + fmt(Math.abs(n)));
// « 12 % » in French, German and Spanish, « 12% » in English
export const pct = (x, digits = 0) => (x == null ? "—" : fmt(100 * x, digits) + (lang() === "en" ? "%" : " %"));
/** The same for a number already in percent (12.5 -> « 12,5 % » / « 12.5% »). */
export const pctN = (n, digits = 0) => (n == null ? "—" : fmt(n, digits) + (lang() === "en" ? "%" : " %"));

export function fmtDate(iso, style = "medium") {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return "Invalid Date";        // (as toLocaleDateString said; a kept formatter would throw)
  const kind = style === "month" || style === "short" ? style : "medium";
  const k = `${locale()}|${kind}`;
  let f = DATES.get(k);
  if (!f) {
    DATES.set(k, f = new Intl.DateTimeFormat(locale(), kind === "month"
      ? { month: "long", year: "numeric" }
      : kind === "short"
        ? { day: "2-digit", month: "2-digit", year: "2-digit" }
        : { day: "numeric", month: "short", year: "numeric" }));
  }
  return f.format(d);
}
export function fmtTime(s) {
  if (s == null) return "—";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, "0"), ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
}
export const isoDay = (d) => d.toISOString().slice(0, 10);
/**
 * A file input's `accept` (owner, 2026-10-30: a phone could not pick its trace): none on a touch screen — iOS greys out the
 * files whose extension it does not know (.fit, .tcx), Android's picker can hide them; the page checks what it gets anyway.
 */
export const fileAccept = (list) => (matchMedia("(pointer: coarse)").matches ? "" : list);
/** A touch screen: its file inputs are buttons (« Choisir … »), nothing is dropped on them. */
export const touchScreen = () => matchMedia("(pointer: coarse)").matches;
/**
 * A GPS trace's file input (owner, 2026-11-06: a phone offered its photo library and camera for a track): on a touch screen MIME
 * types only, « application/octet-stream » the one any file is (iOS: public.data, so .fit and .tcx are not greyed out) — no
 * image type, so iOS opens its files and Android its file picker, with neither photos nor camera; elsewhere the extensions.
 * The dialogs keep « voir tous les fichiers » beside it (an input with no `accept`) for a picker that hides a file all the same.
 */
export const traceAccept = (list = ".gpx,.tcx,.fit") => (touchScreen() ? "application/octet-stream,application/gpx+xml,application/vnd.garmin.tcx+xml,application/xml,text/xml" : list);
export function addDays(iso, n) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function monthEnd(ym) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// ---- stats ----------------------------------------------------------------
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export function summary(values) {
  const v = values.filter((x) => x != null && x > 0).sort((a, b) => a - b);
  if (!v.length) return null;
  const top20 = v.slice(-Math.max(1, Math.round(0.2 * v.length)));
  return {
    n: v.length, mean: mean(v), median: quantile(v, 0.5),
    p10: quantile(v, 0.1), p90: quantile(v, 0.9),
    top20: mean(top20), max: v[v.length - 1], min: v[0],
  };
}

// ---- misc -----------------------------------------------------------------
export function debounce(fn, ms = 200) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
export function initials(name) {
  const parts = (name || "").split(/\s+/).filter(Boolean);
  const last = parts.find((p) => p === p.toUpperCase()) || parts[0] || "";
  const first = parts.find((p) => p !== p.toUpperCase()) || parts[1] || "";
  return ((first[0] || "") + (last[0] || "")).toUpperCase();
}
/** "DUPONT Marie" -> "Marie Dupont" for display. */
export function displayName(nom) {
  if (!nom) return "";
  const parts = nom.split(/\s+/);
  const upper = parts.filter((p) => p.length > 1 && p === p.toUpperCase());
  const rest = parts.filter((p) => !(p.length > 1 && p === p.toUpperCase()));
  if (!upper.length || !rest.length) return nom;
  const cap = (w) => w.toLowerCase().replace(/(^|[-' ])\p{L}/gu, (c) => c.toUpperCase());
  return `${rest.join(" ")} ${upper.map(cap).join(" ")}`;
}
/** "DUPONT Marie" -> { first: "Marie", last: "Dupont" }: the header shows them on two lines. */
export function nameParts(nom) {
  const parts = (nom || "").split(/\s+/).filter(Boolean);
  const isLast = (p) => p.length > 1 && p === p.toUpperCase();
  const cap = (w) => w.toLowerCase().replace(/(^|[-' ])\p{L}/gu, (c) => c.toUpperCase());
  const last = parts.filter(isLast), first = parts.filter((p) => !isLast(p));
  return last.length && first.length ? { first: first.join(" "), last: last.map(cap).join(" ") } : { first: nom || "", last: "" };
}
export function downloadCsv(filename, header, rows) {
  // the separator spreadsheets expect in the interface's language: « ; » in French (decimal comma), « , » in English
  const sep = lang() === "en" ? "," : ";";
  const q = (v) => {
    const s = v == null ? "" : String(v);
    return s.includes(sep) || /["\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = [header, ...rows].map((r) => r.map(q).join(sep)).join("\n");
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function normalise(s) {
  return (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
