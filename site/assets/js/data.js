// Data layer: fetches the static JSON, caches it, and answers the questions
// the pages ask ("who is ranked, with what CN, at this month-end?").

import { TERRAINS, useCountry as storeCountry } from "./store.js";
import * as country from "./country.js";

// Each country's files sit in its own folder, data/<cc>/ (countries/base.py; 2026-10-22: France's in data/fr/), with the
// same names in every country; the countries' index (data/meta.json) and the provisional results (data/prov/) are the
// site's. The pages read the country loaded — the site's country (country.js) — through getJson.
let LOADED = null;                       // the country whose data is loaded ("FR")
// A country whose federation keeps its older seasons to its members (France) has a public copy, data/<cc>/pub/ (site_public.py;
// owner, 2026-10-30): what a visitor without an account, or an account that has not joined the country, reads of its rankings
// (app.js sets the rule: auth.sees). Its agenda, list of competitions and the study's figures are the country's own files.
let publicOnly = () => false;
/** Set the rule: does this visitor read country cc's public copy? */
export const setPublicRule = (fn) => { publicOnly = fn; };
// a country whose ranking only the administrators read (Canada for now, access « admins »): none for the others (app.js)
let hiddenRanking = () => false;
export const setHiddenRule = (fn) => { hiddenRanking = fn; };
const SHARED = /^(agenda|evaluation|validation)\.json$/;
const dirOf = (cc, path = "") => `data/${String(cc).toLowerCase()}/${publicOnly(cc) && !SHARED.test(path) ? "pub/" : ""}`;
/** Is the loaded country read from its public copy (the federation's open seasons only)? */
export const isPublicCopy = () => publicOnly(loadedCountry());
/** The loaded country's folder: "data/fr/". */
export const root = () => dirOf(loadedCountry());
export const loadedCountry = () => LOADED || country.current();
const cache = new Map();

/** A file of the loaded country's folder. */
const getJson = (path) => fetchJson(dirOf(loadedCountry(), path) + path);
/** A file of the site's own (data/meta.json…). */
export const getSiteJson = (path) => fetchJson("data/" + path);
/** A file of another country's folder (the Documentation reads France's when the site's country has no ranking). */
export const countryJson = (cc, path) => fetchJson(dirOf(cc, path) + path);

async function fetchJson(url) {
  const path = url;
  if (cache.has(path)) return cache.get(path);
  const p = fetch(url, { credentials: "same-origin" }).then((r) => {
    if (!r.ok) {
      if (r.status === 404) return null;
      // the session expired or was never valid on the server: back to the login page
      if (r.status === 401) window.dispatchEvent(new Event("cnx:unauthorised"));
      throw new Error(`${path}: HTTP ${r.status}`);
    }
    // a file that does not exist is answered with the app's page (the hosting's fallback): missing too
    if (!(r.headers.get("content-type") || "").includes("json")) return null;
    return r.json();
  });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}

// ---- race-row layout (see build_site.py) ---------------------------------
export const R = {
  cid: 0, course: 1, circuit: 2, dist: 3, date: 4, terrain: 5, epreuve: 6, groupe: 7,
  cat: 8, club: 9, place: 10, nOnCircuit: 11, time: 12, status: 13,
  offScore: 14, offCnj15: 15, offCnAfter: 16,
  fScore: 17, fCnj15: 18, fCnAfter: 19, fCounts: 20,
  t6Raw: 21, t6Score: 22, t6Cnj15: 23, t6CnAfter: 24, t6Counts: 25, t6Weight: 26,
  // (the geometric pair's columns, 27-36, went with it on 2026-10-19; files built before still carry them, unread)
};
export const SCORE_COL = { official: R.offScore, fair: R.fScore, top6w: R.t6Score };
export const CNAFTER_COL = { official: R.offCnAfter, fair: R.fCnAfter, top6w: R.t6CnAfter };
export const CNJ15_COL = { official: R.offCnj15, fair: R.fCnj15, top6w: R.t6Cnj15 };
export const COUNTS_COL = { fair: R.fCounts, top6w: R.t6Counts };
export const WEIGHT_COL = { fair: R.t6Weight, top6w: R.t6Weight };
// competition result row
export const C = {
  lic: 0, place: 1, time: 2, status: 3, cat: 4, club: 5,
  offScore: 6, offCnj15: 7, fScore: 8, fCnj15: 9, t6Score: 10, t6Cnj15: 11,
};
export const C_SCORE = { official: C.offScore, fair: C.fScore, top6w: C.t6Score };
export const C_CNJ15 = { official: C.offCnj15, fair: C.fCnj15, top6w: C.t6Cnj15 };

// ---- core datasets ---------------------------------------------------------
let SITE, META, RUNNERS, COMPS;

/** What the login page needs: the countries the site reads (data/meta.json) and the site's country's figures. */
export async function bootPublic() {
  SITE = await getSiteJson("meta.json");
  LOADED = country.current();
  storeCountry(LOADED, SITE?.countries?.[LOADED]?.methods);
  META = await getJson("meta.json").catch(() => null);
  return META;
}
/** The countries' index: { countries: { FR: { access, federation, ranking, agenda, methods, seasons, counts… } } }. */
export const site = () => SITE;
/**
 * Another country becomes the site's: its own files replace the loaded ones (the next page boots them again).
 * -> true when the data changed.
 */
export async function useCountry(cc) {
  if (cc === LOADED) return false;
  for (const k of [...cache.keys()]) if (!k.startsWith("data/meta.json") && !k.startsWith("data/prov/")) cache.delete(k);
  RUNNERS = null;
  COMPS = null;
  LOADED = cc;
  storeCountry(cc, SITE?.countries?.[cc]?.methods);
  META = await getJson("meta.json").catch(() => null);
  return true;
}
export const isPrivateLoaded = () => !!RUNNERS;
/** The visitor changed (signed in, entered without an account): the loaded country's files are read again, from the folder
 *  its rule now gives. */
export async function reloadCountry() {
  for (const k of [...cache.keys()]) if (!k.startsWith("data/meta.json") && !k.startsWith("data/prov/")) cache.delete(k);
  RUNNERS = null;
  COMPS = null;
  META = await getJson("meta.json").catch(() => null);
}

/**
 * Everything else — only readable once logged in. `open`: the account may read the loaded country's runners (its rule,
 * auth.sees); without it the login gate refuses them (_middleware.js `needs`), so the list stays empty and nobody is
 * recognised by name. A country without a ranking has neither file: both empty.
 */
export async function bootPrivate({ open = true } = {}) {
  if (RUNNERS) return;
  // (refused all the same — the country left on another device, this one not told yet —: the empty list too)
  const none = { cols: [], rows: [] };
  const ranks = !!SITE?.countries?.[loadedCountry()]?.ranking && !hiddenRanking(loadedCountry());
  const [runners, comps] = await Promise.all([
    open && ranks ? getJson("runners.json").catch((e) => (/HTTP 403/.test(e.message) ? none : Promise.reject(e))) : none,
    ranks ? getJson("competitions.json").then((c) => c || { rows: {} }) : { rows: {} }]);
  const cols = runners.cols;
  const ix = Object.fromEntries(cols.map((c, i) => [c, i]));
  const byLic = new Map();
  const list = runners.rows.map((r) => {
    const o = {
      lic: String(r[ix.licence]), nom: r[ix.nom], sexe: r[ix.sexe], first: r[ix.first],
      last: r[ix.last], n: r[ix.n], nBy: Object.fromEntries(TERRAINS.map((x) => [x, r[ix[`n${x}`]] || 0])),
      cat: r[ix.cat], club: r[ix.club],
    };
    byLic.set(o.lic, o);
    return o;
  });
  RUNNERS = { list, byLic };
  COMPS = new Map(Object.entries(comps.rows).map(([id, r]) => [String(id), {
    id: String(id), date: r[0], title: r[1], location: r[2], organizer: r[3],
    groupe: r[4], epreuve: r[5], terrain: r[6], season: r[7], n: r[8] || 0, nCircuits: r[9] || 0,
  }]));
}

/** After logging out: forget what was loaded. */
export function dropPrivate() {
  RUNNERS = null;
  COMPS = null;
  for (const k of [...cache.keys()]) if (!k.endsWith("meta.json")) cache.delete(k);
}
export const meta = () => META;
export const runners = () => RUNNERS;
export const runner = (lic) => RUNNERS.byLic.get(String(lic));

// ---- runner ids --------------------------------------------------------------
// On the site a runner is their country's code and that country's own number (countries/base.py): fr1234567 (an FFCO
// licence), es10000123. The files of a country carry the number alone. A bare number (a link of before 2026-10-22) is France's.
/** "fr1234567" -> { cc: "FR", n: "1234567" }; a bare number is France's; null when not an id. */
export function parseId(id) {
  const m = /^([a-z]{2})?(\d+)$/i.exec(String(id ?? "").trim());
  return m ? { cc: (m[1] || "fr").toUpperCase(), n: m[2] } : null;
}
/** A runner's id on the site, from their number in the loaded country's files. */
export const fullId = (lic, cc = loadedCountry()) => `${String(cc).toLowerCase()}${lic}`;
/** The number in the loaded country's files of a runner's id, or null when the id is another country's. */
export function localId(id) {
  const p = parseId(id);
  return p && p.cc === loadedCountry() ? p.n : null;
}
/** An anonymised runner's pseudonym (privacy.py: 8 digits from 90000001; real licences have at most 7): its name is
 *  « Coureur anonyme N », and no licence is shown nor looked up on FFCO's site. */
export const isAnon = (lic) => /^9\d{7}$/.test(String(lic ?? ""));
export const comp = (id) => COMPS.get(String(id));
export const comps = () => COMPS;

// ---- names -----------------------------------------------------------------
export function clubParts(club) {
  const m = /^(\d{4})([A-Z]*)$/.exec(club || "");
  return m ? { code: m[1], dept: m[1].slice(0, 2), ligue: m[2] || null } : { code: null, dept: null, ligue: null };
}
export function clubName(club) {
  const { code } = clubParts(club);
  return (code && META.names.clubs[code]) || club || "";
}
export const ligueName = (code) => META.names.ligues[code] || code || "";
export const deptName = (code) => META.names.depts[code] || code || "";

// ---- months & snapshots ----------------------------------------------------
export const months = () => META.months;               // month-end ISO dates
export const latestMonth = () => META.months[META.months.length - 1];
export const ym = (iso) => iso.slice(0, 7);
export function monthFor(ymStr) {
  return META.months.find((m) => m.startsWith(ymStr)) || latestMonth();
}

// ---- disciplines -------------------------------------------------------------
/** Forest and sprint: their official CN was one pooled pedestrian ranking ("Ped") before
 *  split_year. VTT and ski always had their own. */
export const FOOT = ["For", "Spr"];
/** The key of a method's ranking in a discipline and year: "Ped" for the pooled official one. */
export function snapTerrain(method, terrain, year) {
  return method === "official" && FOOT.includes(terrain) && Number(year) < META.split_year ? "Ped" : terrain;
}
/** Does a race feed a method's series in a discipline? (the pooled official one: forest and sprint alike) */
export const inSeries = (r, method, terrain) => r[R.terrain] === terrain
  || (FOOT.includes(r[R.terrain]) && snapTerrain(method, terrain, r[R.date].slice(0, 4)) === "Ped");

/** Map(licence -> CN) for one method/discipline at one month-end. */
export async function cnAt(method, terrain, monthIso) {
  const year = Number(monthIso.slice(0, 4));
  const t = snapTerrain(method, terrain, year);
  const snap = await getJson(`snap/${method}_${t}_${year}.json`);
  const out = new Map();
  if (!snap) return out;
  const i = snap.months.findIndex((m) => m === monthIso);
  if (i < 0) return out;
  for (const row of snap.rows) {
    const v = row[1 + i];
    if (v) out.set(String(row[0]), v);
  }
  return out;
}
/** Map(licence -> [category, club]) as at the end of `year`. */
export async function attrsAt(year) {
  const a = await getJson(`snap/attr_${year}.json`);
  return new Map(Object.entries(a || {}));
}
/** Licences ranked (with a CN) in at least one month of `year`, for a method and discipline. */
export async function rankedIn(method, terrain, year) {
  const snap = await getJson(`snap/${method}_${snapTerrain(method, terrain, Number(year))}_${year}.json`);
  return new Set((snap?.rows || []).map((r) => String(r[0])));
}
/** Month-end a year before, if it exists in the archive. */
export function monthYearBefore(monthIso) {
  const y = Number(monthIso.slice(0, 4)) - 1;
  return META.months.find((m) => m.startsWith(`${y}-${monthIso.slice(5, 7)}`)) || null;
}

// ---- per-entity files ------------------------------------------------------
// r/ and net/: a runner's number // the country's bucket (meta.bucket: France 10, a country of sequential numbers 100);
// club/ and club_courses/: one file a club, or packed by a hash of its code (meta.club_packs; site_io.club_pack)
const bucketOf = (n) => (/^\d+$/.test(n) ? Math.floor(Number(n) / (META?.bucket || 10)) : 999999);
const clubPack = (code) => [...String(code)].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 0) % META.club_packs;
const clubFile = async (dir, code) => (META?.club_packs ? (await getJson(`${dir}/p${clubPack(code)}.json`))?.[code] : getJson(`${dir}/${code}.json`));
export async function runnerRaces(lic) {
  const n = String(lic);
  const bucket = bucketOf(n);
  const b = await getJson(`r/${bucket}.json`);
  return (b && b[n]) || [];
}
// c/: five competitions to a file by their id (meta.c_group, site_io.course_file: g<id // c_group>.json = {id: results}),
// else one a competition (data built before 2026-10-23)
/** The official CN 15 days before the build day, per discipline: { date, cn: { For: { licence: cn } } } (build_site). */
export const officialJ15 = () => getJson("snap/official_j15.json");
export const course = async (id) => {
  const k = META?.c_group;
  if (!k) return getJson(`c/${id}.json`);
  const name = /^\d+$/.test(String(id)) ? `g${Math.floor(Number(id) / k)}` : String(id);
  return (await getJson(`c/${name}.json`))?.[id] ?? null;
};
/** A runner's races of the 12 months to `month` in a discipline, and how many were mispunched (« pm »): { n, pm }. */
export function pmRate(races, terrain, month) {
  const from = new Date(Date.parse(month) - 365 * 86400e3).toISOString().slice(0, 10);
  const rs = races.filter((r) => r[R.terrain] === terrain && r[R.date] > from && r[R.date] <= month);
  return { n: rs.length, pm: rs.filter((r) => r[R.status] === "pm").length };
}
/** A percentile (0-100, 100 = the best) as shown: whole numbers, the top only for the best. */
export const fmtPct = (p) => (p == null ? "—" : String(p >= 100 ? 100 : Math.floor(p)));
/** Competitions (course ids) a club took part in. */
export const clubCourses = async (code) => (await clubFile("club_courses", code)) || [];
export const clubSeries = (code) => clubFile("club", code);
// club monthly aggregate layout (see site_extras.py)
export const CLUB = { n: 0, median: 1, max: 2, sum: 3, top5: 4 };

/**
 * Co-runners in one discipline ("For", "Spr", "VTT", "Ski") or all of them (""):
 * [[licence, shared circuits, finished ahead, finished behind, last met]].
 */
export async function coRunners(lic, terrain = "") {
  const n = String(lic);
  const v = (await getJson(`net/${bucketOf(n)}.json`))?.[n];
  if (!v) return [];
  const own = v[terrain || "*"];                  // "*": the only discipline raced, same list
  return (own === "*" ? v["*"] : own) || [];
}
/** Another country's federation ranking as it publishes it (Spain's FEDO: build_site official.json): { federation, seasons:
 *  { "2026": { For: { as_of, races: [[column, name]], rows: [[id, name, club, cat, rank, total, n, m1, m2, [points]]] } } } }. */
export const officialTable = () => getJson("official.json");
export const ageCurves = () => getJson("agecurve.json");
/** Per season: [[club, terrain, competitors, results]] (site_extras.pyramid). */
export const participation = async () => (await getJson("participation.json"))?.seasons || {};
/** The runners with the most races (site_extras.most_races): { types, periods: { all|<season>: { from, to, runners, results,
 *  rows: [[licence, races, [count by type], category, club, seasons, first day, last day]] } } }. */
export const mostRaces = () => getJson("mostraces.json");
/** Head-to-head accuracy of each method, per terrain and season (site_extras.validation). */
export const validation = () => getJson("validation.json");
/** The sound evaluation of the methods: per circuit, out of sample, bootstrap intervals (site_eval.py). */
export const evaluation = () => getJson("evaluation.json");
/** The Coupe de France des clubs recomputed every season (site_extras.cfc). */
export const cfc = () => getJson("cfc.json");
/** The national relays' history, the Championnat de France des Clubs and the CNE, every team of every edition found
 *  (relays.py): { clubs: {code: [short, FFCO's name]}, editions: {cfc|cne: {year: {at, dep, st, div}}},
 *  rows: {category: {year: [[place, team, club, time, status]]}} }. */
export const relays = () => getJson("relays.json");
// the individual championships (champs.py): the index of editions and podiums, and one edition's whole rankings
export const champs = () => getJson("champs.json");
export const champEdition = (key) => getJson(`champs/${key}.json`);
/** Competitors of a season, counted: [[category, club, discipline flags (1 forest, 2 sprint), n]]. */
export const pyramid = async (season) => (await getJson(`pyramid/${season}.json`))?.rows || [];
/** Upcoming events of the FFCO agenda (built daily by ffco_scraper/agenda.py). */
export const agenda = () => getJson("agenda.json");
export const eliteSummary = () => getJson("elite_summary.json");
// elite row layout: [course, licence, category, rank in category, points, club code]
export const E = { course: 0, lic: 1, cat: 2, rank: 3, pts: 4, club: 5 };
export const eliteSeason = async (y) => (await getJson(`elite/${y}.json`))?.rows || [];

/**
 * National-race points in the 365 days up to `iso` for one discipline:
 * { rows, elite: Map(club -> pts), all: Map(club -> pts) }. "elite" keeps H21/D21 only.
 */
export async function eliteWindow(iso, terrain) {
  const y = Number(iso.slice(0, 4));
  const from = new Date(iso + "T00:00:00Z");
  from.setUTCDate(from.getUTCDate() - 365);
  const fromIso = from.toISOString().slice(0, 10);
  const [a, b, sum] = await Promise.all([eliteSeason(y - 1), eliteSeason(y), eliteSummary()]);
  const cats = new Set(sum?.cats || ["H21", "D21"]);
  const rows = [...a, ...b].filter((r) => {
    const c = comp(r[E.course]);
    return c && c.terrain === terrain && c.date > fromIso && c.date <= iso;
  });
  const elite = new Map(), all = new Map();
  for (const r of rows) {
    const k = r[E.club];
    if (!k) continue;
    all.set(k, (all.get(k) || 0) + r[E.pts]);
    if (cats.has(r[E.cat])) elite.set(k, (elite.get(k) || 0) + r[E.pts]);
  }
  return { rows, elite, all, cats };
}

export const officialCircuitUrl = (cid) => `https://cn.ffcorientation.fr/circuit/${cid}/`;
export const officialCourseUrl = (id) => `https://cn.ffcorientation.fr/course/${id}/`;
