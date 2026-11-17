// Qualification for France's individual championships by the national ranking (owner, 2026-11-17).
// FFCO's rule since 2026 (« Quoi de neuf dans le RC 2026 »): a licensee is qualified for the CF moyenne distance, longue
// distance or sprint when their official CN in the discipline (forest for MD and LD, sprint for the CFS), about three months
// before the race, is at or above the threshold FFCO sets for their category — none for D/H12 (all of them run the MD and the
// LD), 1 (any CN) for D/H75 and older; the thresholds aim at a number of qualified a category, twice it in D/H21. They are set
// again for each championship, so the site shows the last ones FFCO published, written here from its lists
// (archives.ffcorientation.fr › Courses › Qualifications). The other ways in — the « qualifiés d'office » (high level, the
// previous CF's first ten, the league championships, the leagues' quotas) — are not known to Ozimut and not shown.
// VTT and ski have no qualification by the ranking.
//
// A new season's thresholds: add its block, keep the older ones (a past month is judged on its own season's).

const ANY = 1;                       // « CN non nul »
const ALL = 0;                       // every runner of the category (D/H12), CN or not

// key: championship; per season: the CN's day FFCO used, and the thresholds by category (a sprint group "18-20" covers both)
export const CHAMPS = {
  md: {
    terrain: "For",
    seasons: {
      // CF MD 2026, Bourbach-le-Bas, 9 May; CN of 9 February 2026. FFCO printed no thresholds for it: each is its list's lowest
      // CN in the category rounded down to the hundred (the CNs between the two belonged to nobody that day)
      2026: { cnDay: "2026-02-09", race: "2026-05-09",
        D: { 12: ALL, 14: 1000, 16: 1800, 18: 2300, 20: 2400, 21: 3800, 35: 3100, 40: 3100, 45: 3100, 50: 3100, 55: 2800, 60: 2600, 65: 1800, 70: 1200, 75: ANY },
        H: { 12: ALL, 14: 1600, 16: 2400, 18: 3400, 20: 3800, 21: 5600, 35: 4900, 40: 4900, 45: 4900, 50: 4600, 55: 4400, 60: 4100, 65: 3500, 70: 2500, 75: ANY } },
    },
  },
  ld: {
    terrain: "For",
    seasons: {
      // CF LD 2026, Claudon, 23 August; CN of 23 May 2026 (FFCO's « Seuil de qualification pour la catégorie »)
      2026: { cnDay: "2026-05-23", race: "2026-08-23",
        D: { 12: ALL, 14: 1000, 16: 1900, 18: 2500, 20: 2500, 21: 3900, 35: 3100, 40: 3100, 45: 3100, 50: 3100, 55: 2700, 60: 2500, 65: 1600, 70: ANY },
        H: { 12: ALL, 14: 1500, 16: 2500, 18: 3600, 20: 3600, 21: 5800, 35: 4900, 40: 4900, 45: 4900, 50: 4600, 55: 4400, 60: 4000, 65: 3500, 70: ANY } },
    },
  },
  cfs: {
    terrain: "Spr",
    seasons: {
      // CF Sprint 2026, Saint-Étienne, 24 October; CN of 24 July 2026 (FFCO's « Seuil de qualification », by groups of
      // categories; no D/H12 in its table)
      2026: { cnDay: "2026-07-24", race: "2026-10-24",
        D: { 14: ANY, 16: 2500, 18: 3600, 20: 3600, 21: 3800, 35: 3800, 40: 3700, 45: 3700, 50: 3400, 55: 3400, 60: 2800, 65: 2800, 70: ANY },
        H: { 14: 1800, 16: 3000, 18: 5000, 20: 5000, 21: 5500, 35: 5500, 40: 5080, 45: 5080, 50: 4750, 55: 4750, 60: 3900, 65: 3900, 70: ANY } },
    },
  },
};

/** The championships a discipline's ranking qualifies for. */
export const champsOf = (terrain) => Object.keys(CHAMPS).filter((k) => CHAMPS[k].terrain === terrain);
/** Every championship, in the order they are shown (MD, LD, Sprint). */
export const ALL_CHAMPS = Object.keys(CHAMPS);

/** One runner's standing for a season: "ok" (at or above the threshold), "no" (below, or no CN in the discipline),
 *  "na" (their category does not run that championship); s the threshold (0 every runner, 1 any CN). */
export function standing(season, cat, cn) {
  const s = threshold(season, cat);
  if (s == null) return { st: "na", s: null };
  return { st: s === ALL || (cn != null && cn >= s) ? "ok" : "no", s };
}

/** The thresholds that apply to a month: its season's, else the latest season before it; none before 2026. */
export function seasonFor(champ, monthIso) {
  const y = Number(monthIso.slice(0, 4));
  const years = Object.keys(CHAMPS[champ].seasons).map(Number).filter((s) => s <= y).sort((a, b) => b - a);
  return years.length ? { year: years[0], ...CHAMPS[champ].seasons[years[0]] } : null;
}

/** A category's threshold in a season's table ("H21" → 5800; 70 and over share the last age listed), or null. */
export function threshold(season, cat) {
  const sex = (cat || "")[0], age = Number((cat || "").slice(1));
  const table = season?.[sex];
  if (!table || !age) return null;
  if (table[age] != null) return table[age];
  const ages = Object.keys(table).map(Number).sort((a, b) => a - b);
  const top = ages[ages.length - 1];
  return age > top ? table[top] : null;          // older than the table's last age: its rule (any CN); else not run
}

/** Is a runner of a category, with this official CN, above the season's threshold? null: no such category. */
export function qualifies(season, cat, cn) {
  const s = threshold(season, cat);
  if (s == null) return null;
  if (s === ALL) return true;
  return cn != null && cn >= s;
}
