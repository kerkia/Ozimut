// Who may read each country's data (site/data/<cc>/; countries/base.py ACCESS — keep the two in step). A country the site
// has no data for is not listed: its folder is nobody's (the login gate, _middleware.js `needs`).
//   "members": the accounts that joined it (an accepted membership, the session's `cc`) — France: the FFCO's older seasons
//              are members-only on its own site;
//   "all":     every signed-in account — Spain: every result is public, so what is computed from them is too (owner,
//              2026-10-22).
// (Its own module: the login gate imports it, and countries.js imports api.js, which imports the gate.)
//   "admins":  the administrators only, the country's calendar apart — Canada (owner, 2026-11-11: its results and ranking
//              shown to the administrators until its clubs have been asked): /data/ca/ but its agenda, and its races'
//              files of the provisional results (/data/prov/[pub/]ca….json; the gate's `adminOnly`).
export const DATA_ACCESS = { FR: "members", ES: "all", CA: "admins" };
/** The countries whose data only the administrators read (lower case, as in the paths). */
export const ADMIN_ONLY = Object.keys(DATA_ACCESS).filter((cc) => DATA_ACCESS[cc] === "admins").map((cc) => cc.toLowerCase());
/** Is this path (canonical, lower case) the data of a country only the administrators read? Its agenda is everyone's. */
export function adminOnly(path) {
  return ADMIN_ONLY.some((cc) => (path.startsWith(`/data/${cc}/`) && path !== `/data/${cc}/agenda.json`)
    || new RegExp(`^/data/prov/(pub/)?${cc}[a-z]{0,3}\\d[a-z0-9_-]*\\.json$`).test(path));
}
// the countries whose agenda alone the site reads (countries/agenda.py, 2026-10-23): open to everyone, as their calendars are
for (const cc of ["AT", "BE", "BG", "BR", "BY", "CH", "CZ", "DE", "DK", "EE", "GB", "GE", "HK", "HR", "IE", "IL", "IT", "JP",
  "KR", "LT", "MK", "PL", "RO", "RS", "SI", "SK", "TR", "UA", "ZA"]) DATA_ACCESS[cc] = "all";
// « IOF WRE » (countries/wre.py, 2026-11-04): the IOF's World Ranking Events, listed as a country of its own
DATA_ACCESS.XW = "all";
// « Tous les pays » (countries/world.py, 2026-11-21): every country's agenda in one, and OrienteeringOnline's competitions
DATA_ACCESS.XA = "all";
