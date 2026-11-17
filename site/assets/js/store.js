// Global, persisted UI state shared by every page.

// The methods a visitor picks from: FFCO's official CN and the Ozimut method (top6w, « Top » until 2026-10-19). Since
// 2026-10-19 (owner) there are no analysis methods: the geometric pair (fair3 / top6w3) is gone, and the usual level
// (fair) only values the circuits, shown to nobody. Old links and saved choices naming them open the Ozimut method.
export const METHODS = ["official", "top6w"];
const RENAMED = { top6w2: "top6w", fair2: "top6w", top6w3: "top6w", fair3: "top6w", fair: "top6w" };
// the loaded country's methods (data/meta.json `countries.<cc>.methods`; Spain's Ozimut index alone, its federation's
// ranking being a table of its own): set by useCountry; the method saved stays the visitor's for the countries that have it
let AVAIL = METHODS;
/** The methods this visitor may see and pick. */
export const available = () => AVAIL;
// Disciplines offered by the site-wide selector: forest, sprint, mountain bike, ski.
export const TERRAINS = ["For", "Spr", "VTT", "Ski"];
export const MAX_COMPARE = 8;

const KEY = "cnx.state";
// One method at a time for the whole site (owner, 2026-10-12: several at once confused most users), chosen at the right
// of the header's second row; « methods » stays as the one-element list the pages read.
const defaults = {
  method: "official",
  methods: ["official"],
  arenaMethod: "official", // Arena's own (owner, 2026-10-31: chosen in Réglages; Stats keeps its switch)
  terrain: "For",
  allTerrains: false,     // « Toutes » chosen on a page listing races (app.terrainChoice); the others keep `terrain`
  compare: [],            // [{lic, slot}] — slot is a fixed colour index 0..7
  clubs: [],              // [{code, slot}] — clubs being compared, same slot rule
  pageSize: 50,           // ranking list: 25 | 50 | 100 | "all"
  lastRunner: null,       // the current runner: last one opened, centred on or added anywhere
  cc: null,               // the country whose runners and clubs the three above name (their numbers are that country's)
  byCountry: {},          // the same three of the other countries, kept for a return to them: { ES: { compare, clubs, lastRunner } }
};
// what names a country's own runners and clubs (their numbers in its files, data.js): kept per country
const PER_COUNTRY = ["compare", "clubs", "lastRunner"];

let state = load();
const listeners = new Set();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "{}");
    if (!TERRAINS.includes(s.terrain)) delete s.terrain;
    // (a selection of several methods, saved before 2026-10-12, gives way to the default)
    if (RENAMED[s.method]) s.method = RENAMED[s.method];
    if (!METHODS.includes(s.method)) s.method = defaults.method;
    s.methods = [s.method];
    // Arena's method, saved before it had its own: the one Stats showed, which Arena followed until then
    if (RENAMED[s.arenaMethod]) s.arenaMethod = RENAMED[s.arenaMethod];
    if (!METHODS.includes(s.arenaMethod)) s.arenaMethod = s.method;
    delete s.mv;
    return { ...defaults, ...s };
  } catch (e) {
    return { ...defaults };
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}
/** The state, its method the one chosen when the loaded country has it, else that country's first. */
export const get = () => (AVAIL.includes(state.method) ? state : { ...state, method: AVAIL[0], methods: [AVAIL[0]] });
/** Re-read after another tab changed the saved state. */
export function reload() {
  state = load();
  listeners.forEach((fn) => fn(state));
}
export function set(patch) {
  state = { ...state, ...patch };
  save();
  listeners.forEach((fn) => fn(state));
}
/**
 * Another country's data loaded (data.useCountry): its own selection of runners and clubs comes back, the one left is
 * kept for later. A selection saved before the countries is France's.
 */
export function useCountry(cc, methods) {
  const ms = (methods || METHODS).filter((m) => METHODS.includes(m));
  AVAIL = ms.length ? ms : METHODS;
  const from = state.cc || "FR";
  if (from === cc) {
    if (!state.cc) set({ cc });
    return;
  }
  const keep = Object.fromEntries(PER_COUNTRY.map((k) => [k, state[k]]));
  const back = state.byCountry?.[cc] || {};
  const byCountry = { ...(state.byCountry || {}), [from]: keep };
  delete byCountry[cc];
  set({ cc, byCountry, compare: back.compare || [], clubs: back.clubs || [], lastRunner: back.lastRunner || null });
}
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// the method shown before the last switch (this visit only): the runner's chart draws it as a faint grey line
let previous = null;
export const prevMethod = () => previous;
/** The site's method; `quiet`: from a link (?m=), not a switch, so no previous method to show. */
export function setMethod(m, { quiet = false } = {}) {
  m = RENAMED[m] || m;                                     // an old link (?m=top6w2)
  if (!available().includes(m) || m === state.method) return;
  previous = quiet ? null : state.method;
  set({ method: m, methods: [m] });
}
export const toggleMethod = (m) => setMethod(m);

// Arena's ranking method (owner, 2026-10-31): chosen in Réglages, apart from Stats' switch — Arena's results, live races and
// runner windows show it (the CN J-15, scores and expected places); the loaded country's first when it lacks it (Spain).
export const arenaMethod = () => (AVAIL.includes(state.arenaMethod) ? state.arenaMethod : AVAIL[0]);
export function setArenaMethod(m) {
  if (METHODS.includes(m) && m !== state.arenaMethod) set({ arenaMethod: m });
}
/** The method of the page shown: Arena's own in Arena, else the site's (Stats' switch). */
export const pageMethod = () => (document.body?.dataset.group === "arena" ? arenaMethod() : get().method);

// ---- comparison set -------------------------------------------------------
// Colour follows the runner, not their position: a runner keeps its slot until
// removed, and a newcomer takes the lowest free slot. Removing someone must
// never repaint the others.
export const inCompare = (lic) => state.compare.some((c) => c.lic === lic);
export const slotOf = (lic) => state.compare.find((c) => c.lic === lic)?.slot;
export function addCompare(lic) {
  if (inCompare(lic)) return true;
  if (state.compare.length >= MAX_COMPARE) return false;
  const used = new Set(state.compare.map((c) => c.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  // the runner just picked becomes the current one for pages with no selection of their own
  set({ compare: [...state.compare, { lic, slot }], lastRunner: lic });
  return true;
}
export function removeCompare(lic) {
  set({ compare: state.compare.filter((c) => c.lic !== lic) });
}
export function toggleCompare(lic) {
  return inCompare(lic) ? (removeCompare(lic), true) : addCompare(lic);
}
export function setCompare(lics) {
  const kept = state.compare.filter((c) => lics.includes(c.lic));
  const used = new Set(kept.map((c) => c.slot));
  const out = [...kept];
  for (const lic of lics) {
    if (out.length >= MAX_COMPARE) break;
    if (out.some((c) => c.lic === lic)) continue;
    let slot = 0;
    while (used.has(slot)) slot++;
    used.add(slot);
    out.push({ lic, slot });
  }
  set({ compare: out });
}

// ---- club comparison: same fixed-slot rule, keyed by 4-digit club code -----
export const MAX_CLUBS = 8;
export const inClubs = (code) => state.clubs.some((c) => c.code === code);
export function addClub(code) {
  if (inClubs(code)) return true;
  if (state.clubs.length >= MAX_CLUBS) return false;
  const used = new Set(state.clubs.map((c) => c.slot));
  let slot = 0;
  while (used.has(slot)) slot++;
  set({ clubs: [...state.clubs, { code, slot }] });
  return true;
}
export function removeClub(code) {
  set({ clubs: state.clubs.filter((c) => c.code !== code) });
}
export function toggleClub(code) {
  return inClubs(code) ? (removeClub(code), true) : addClub(code);
}
export function setClubs(codes) {
  const kept = state.clubs.filter((c) => codes.includes(c.code));
  const used = new Set(kept.map((c) => c.slot));
  const out = [...kept];
  for (const code of codes) {
    if (out.length >= MAX_CLUBS) break;
    if (out.some((c) => c.code === code)) continue;
    let slot = 0;
    while (used.has(slot)) slot++;
    used.add(slot);
    out.push({ code, slot });
  }
  set({ clubs: out });
}
