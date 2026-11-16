// The control description symbols (Purple Pen's symbols.xml, as assets/tracer/symbols.json; BSD licence,
// assets/tracer/LICENSE-PurplePen.txt): a symbol by id for a description standard, its name and texts in a language
// (Purple Pen's Symbol.FindBestText: the language's own text, else English; singular or plural, gender, case), and its
// drawing as paths in a box (a square cell, or eight cells for an instruction line).

import { lang as uiLang } from "./lang.js";

let DB = null, LOADING = null, ALL_TEXTS = null;
// ISCD 2024 (owner, 2026-11-16) is ISCD 2018 with two more symbols — 5.24 « Railway » (« a railway, tramway, or other kind of railed
// track »: Purple Pen's 5.26) and 15.6 « Map flip » — which Purple Pen files under its « 2018 »: the strict 2018 standard does not
// offer them. Purple Pen's file has no French, German or Spanish for a few symbols of 2018 and 2024: ISCD 2024's own words here,
// so that no sheet falls back to English.
const NEW_2024 = new Set(["5.26", "15.6"]);
const base = (std) => (std === "2024" ? "2018" : std || "2018");
const PATCH = {                                                    // i18n-ignore-next 8
  "2.10": { n: { fr: "Tranchée", es: "Trinchera" }, t: { fr: [{ t: "tranchée" }, { t: "tranchées", p: 1 }], es: [{ t: "trinchera" }, { t: "trincheras", p: 1 }] } },
  "5.25": { n: { fr: "Zone interdite", es: "Área fuera de límites" }, t: { fr: [{ t: "zone interdite" }, { t: "zones interdites", p: 1 }], es: [{ t: "área prohibida" }, { t: "áreas prohibidas", p: 1 }] } },
  "5.26": { n: { en: "Railway, tramway", fr: "Voie ferrée, tramway", de: "Eisenbahn, Straßenbahn", es: "Vía férrea, tranvía" },
    t: { fr: [{ t: "voie ferrée" }, { t: "voies ferrées", p: 1 }], de: [{ t: "Eisenbahn" }, { t: "Eisenbahnen", p: 1 }], es: [{ t: "vía férrea" }, { t: "vías férreas", p: 1 }] } },
  "13.5control": { n: { fr: "Changement de carte au poste", es: "Cambio de mapa en el control" }, t: { fr: [{ t: "changement de carte au poste" }], es: [{ t: "cambio de mapa en el control" }] } },
  "15.6": { n: { fr: "Retournement de carte", de: "Karte wenden", es: "Volteo del mapa" }, t: { fr: [{ t: "retourner la carte" }], de: [{ t: "Karte wenden" }], es: [{ t: "dar la vuelta al mapa" }] } },
  "13.6": { n: { fr: "Point de remise de carte", es: "Punto de entrega del mapa" }, t: { fr: [{ t: "{0}jusqu'au départ" }], es: [{ t: "{0}hasta la salida" }] } },
};
function patch() {
  for (const [id, p] of Object.entries(PATCH)) for (const s of DB?.byId[id] || []) {
    s.n = { ...(s.n || {}) }; s.t = { ...(s.t || {}) };
    for (const [l, v] of Object.entries(p.n)) if (!s.n[l] || l === "en") s.n[l] = v;
    for (const [l, v] of Object.entries(p.t)) if (!s.t[l]) s.t[l] = v;
  }
}
const URL_MAIN = "assets/tracer/symbols.json", URL_TEXTS = "assets/tracer/symbol-texts.json";

/** Load the symbols (once). */
export async function loadSymbols() {
  if (DB) return DB;
  if (!LOADING) LOADING = fetch(URL_MAIN).then((r) => r.json()).then((j) => {
    const byId = {};
    for (const s of Object.values(j.symbols)) (byId[s.id] ||= []).push(s);
    DB = { languages: j.languages, byId, all: Object.values(j.symbols) };
    patch();
    return DB;
  });
  return LOADING;
}
/** The texts of every language (for an event described in neither French nor English). */
export async function loadAllTexts() {
  if (ALL_TEXTS) return ALL_TEXTS;
  await loadSymbols();
  const j = await fetch(URL_TEXTS).then((r) => r.json());
  ALL_TEXTS = j.symbols;
  for (const [key, v] of Object.entries(j.symbols)) {
    const s = DB.all.find((x) => (x.std ? `${x.id}@${x.std.join(",")}` : x.id) === key) || DB.byId[key.split("@")[0]]?.[0];
    if (s) { s.n = v.n; s.t = v.t; }
  }
  patch();
  return ALL_TEXTS;
}
export const symbolsLoaded = () => !!DB;
/** Every text of a language in the symbol file (names and description texts): what its sheets may print. */
export function languageStrings(lang) {
  const out = [DB?.languages?.[lang]?.name || ""];
  for (const s of DB?.all || []) { if (s.n?.[lang]) out.push(s.n[lang]); for (const x of s.t?.[lang] || []) out.push(x.t); }
  return out;
}
export const languages = () => DB?.languages || {};

// the open event's own symbols (the advanced level: ev.symbols, drawn by the user — mysymbols.js), ids « x:<n> », in Purple
// Pen's shape: { id, k (column), n: { lang: name }, t: { lang: [{ t }] }, g (strokes in -100…100, y up) }
let CUSTOM = {};
/** Set the event's own symbols (the editor, at each refresh). */
export function setCustomSymbols(map) {
  CUSTOM = {};
  for (const [id, s] of Object.entries(map || {})) CUSTOM[`x:${id}`] = { ...s, id: `x:${id}`, custom: true };
}
/** The symbol with this id in a standard ("2004", "2018" or "2024"), or null. */
export function symbol(id, standard = "2018") {
  if (CUSTOM[id]) return CUSTOM[id];
  const list = DB?.byId[id];
  if (!list) return null;
  return list.find((s) => !s.std || s.std.includes(base(standard))) || null;
}
export const existsIn = (id, standard) => !!symbol(id, standard);
/** Symbols offered for a column (C…H, or a directive letter), in the standard, in Purple Pen's order; the event's own last. */
export function symbolsFor(kind, standard = "2018") {
  return [...(DB?.all || []).filter((s) => s.k === kind && (!s.std || s.std.includes(base(standard))) && !(standard === "2018" && NEW_2024.has(s.id))), ...Object.values(CUSTOM).filter((s) => s.k === kind)];
}

// ---- texts ---------------------------------------------------------------------------------------------------------
/** Purple Pen's FindBestText over a list of { t, p, g, c, mc } (or custom texts { text, plural, gender, case, modCase, lang }). */
function bestText(texts, lang, plural, gender = "", nounCase = "") {
  const L = DB?.languages?.[lang];
  const defCase = L?.cases?.length ? L.cases[0] : "";
  let best = null, bestM = 1e9;
  for (const [tl, list] of texts) for (const x of list) {
    const xl = x.lang ?? tl, xp = !!(x.p ?? x.plural), xg = x.g ?? x.gender ?? "", xc = x.c ?? x.case ?? "";
    let m = 0;
    if (xl !== lang && xl !== "en") m += 100;
    if (xl !== lang && xl === "en") m += 50;
    if (xp !== !!plural) m += 10;
    if (gender && xg !== gender) m += 5;
    if (nounCase && xc !== nounCase) m += 3;
    if (!nounCase && xc && xc !== defCase) m += 1;
    if (m < bestM) { bestM = m; best = x; }
  }
  return best;
}
const textsOf = (s) => Object.entries(s?.t || {});
export function symbolText(s, lang, { plural = false, gender = "", nounCase = "", custom = null } = {}) {
  if (!s) return null;
  if (custom?.length && custom.some((x) => x.lang === lang)) return bestText([["", custom]], lang, plural, gender, nounCase)?.text ?? null;
  const b = bestText(textsOf(s), lang, plural, gender, nounCase);
  return b ? b.t : null;
}
export function symbolGender(s, lang, custom = null) {
  if (custom?.length && custom.some((x) => x.lang === lang)) return bestText([["", custom]], lang, false, "", "")?.gender ?? "";
  return bestText(textsOf(s), lang, false, null, "")?.g ?? "";
}
export function modifiedCase(s, lang, custom = null) {
  if (custom?.length && custom.some((x) => x.lang === lang)) return bestText([["", custom]], lang, false, "", "")?.modCase ?? "";
  return bestText(textsOf(s), lang, false, "", "")?.mc ?? "";
}
/** The symbol's name in a language (the user interface's), else English. */
export const symbolName = (s, lang = uiLang()) => s?.n?.[lang] || s?.n?.en || s?.id || "";

// ---- drawing ---------------------------------------------------------------------------------------------------------
/**
 * The symbol's strokes as path commands in a box (left, top, width, height; y down, as on a page): returns
 * [{ d: [["M",x,y],["L",x,y],["C",…],["Z"]], stroke: width|0, fill: bool, cap: "round"|"butt", join: "round"|"miter" }].
 * Instruction lines (kinds T and after) span 1600 units across, other symbols 200.
 */
export function symbolPaths(s, left, top, width, height) {
  if (!s?.g) return [];
  const wide = s.k >= "T";
  const sx = width / (wide ? 1600 : 200), sy = height / 200, cx = left + width / 2, cy = top + height / 2;
  const P = (x, y) => [cx + x * sx, cy - y * sy];
  const k = (sx + sy) / 2;
  const out = [];
  const poly = (pts, close) => {
    const d = [];
    for (let i = 0; i < pts.length; i += 2) d.push([i ? "L" : "M", ...P(pts[i], pts[i + 1])]);
    if (close) d.push(["Z"]);
    return d;
  };
  const bez = (pts, close) => {
    const d = [["M", ...P(pts[0], pts[1])]];
    for (let i = 2; i + 5 < pts.length; i += 6) d.push(["C", ...P(pts[i], pts[i + 1]), ...P(pts[i + 2], pts[i + 3]), ...P(pts[i + 4], pts[i + 5])]);
    if (close) d.push(["Z"]);
    return d;
  };
  const circle = (x, y, r) => {
    const [px, py] = P(x, y), rx = r * sx, ry = r * sy, c = 0.5522847498;
    return [["M", px + rx, py], ["C", px + rx, py + ry * c, px + rx * c, py + ry, px, py + ry], ["C", px - rx * c, py + ry, px - rx, py + ry * c, px - rx, py],
      ["C", px - rx, py - ry * c, px - rx * c, py - ry, px, py - ry], ["C", px + rx * c, py - ry, px + rx, py - ry * c, px + rx, py], ["Z"]];
  };
  for (const g of s.g) {
    switch (g[0]) {
      case "l": out.push({ d: poly(g[4], false), stroke: g[1] * k, cap: g[2] === "f" ? "butt" : "round", join: g[3] === "s" ? "miter" : "round" }); break;
      case "p": out.push({ d: poly(g[3], true), stroke: g[1] * k, cap: "round", join: g[2] === "s" ? "miter" : "round" }); break;
      case "fp": out.push({ d: poly(g[1], true), fill: true }); break;
      case "c": out.push({ d: circle(g[3][0], g[3][1], g[2]), stroke: g[1] * k, cap: "round", join: "round" }); break;
      case "fc": out.push({ d: circle(g[2][0], g[2][1], g[1]), fill: true }); break;
      case "b": out.push({ d: bez(g[3], false), stroke: g[1] * k, cap: g[2] === "f" ? "butt" : "round", join: "round" }); break;
      case "fb": out.push({ d: bez(g[1], true), fill: true }); break;
      default: break;
    }
  }
  return out;
}
