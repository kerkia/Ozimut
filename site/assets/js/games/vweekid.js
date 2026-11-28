// Pixel's « compétition de la semaine » (owner, 2026-11-28): the week's identity, shared by the pages and the server
// (functions/api/virtual/comp imports this file: no import here, no browser API). One competition a week, Monday to Sunday in
// Paris, its id « week-YYYYWW » (the ISO week-year and week number); its format in turn — long distance, middle distance,
// sprint —; three courses, « a » (the longest and hardest), « b », « c ». The world itself is made in the browser from the id
// (games/vweek.js); the server only knows the week, its days, its format and its course ids.
// docs/pixel/competitions.md is the contract.

export const WEEK_RE = /^week-(\d{4})(\d{2})$/;
export const WEEK_FORMATS = ["ld", "md", "sprint"];
export const WEEK_COURSES = ["a", "b", "c"];

const DAY = 86400000;
/** Paris's calendar day of an instant, as days since 1970-01-01 (the day's UTC midnight ÷ 86 400 000). */
function parisDays(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return Math.round(Date.UTC(+p.year, +p.month - 1, +p.day) / DAY);
}
/** Paris's day of an instant as YYYY-MM-DD. */
export const parisDate = (d = new Date()) => iso(parisDays(d));
const iso = (days) => new Date(days * DAY).toISOString().slice(0, 10);
/** The Monday (days since 1970) of the week holding that day: 1970-01-05, day 4, was a Monday. */
const mondayOf = (days) => days - ((((days - 4) % 7) + 7) % 7);
/** A Monday's id: the ISO week of its Thursday. */
function idOfMonday(mon) {
  const thu = new Date((mon + 3) * DAY), year = thu.getUTCFullYear();
  const jan4 = Math.round(Date.UTC(year, 0, 4) / DAY), week = 1 + Math.round((mon - mondayOf(jan4)) / 7);
  return `week-${year}${String(week).padStart(2, "0")}`;
}
/** A week's Monday (days since 1970), or null for anything but a real week's id. */
function mondayOfId(id) {
  const m = WEEK_RE.exec(String(id || ""));
  if (!m) return null;
  const jan4 = Math.round(Date.UTC(+m[1], 0, 4) / DAY), mon = mondayOf(jan4) + (+m[2] - 1) * 7;
  return idOfMonday(mon) === id ? mon : null;
}

/** The id of the week of an instant (Paris), `shift` weeks later (−1: the week before). */
export const weekId = (d = new Date(), shift = 0) => idOfMonday(mondayOf(parisDays(d)) + shift * 7);
/** Is this a real week's id? */
export const isWeek = (id) => mondayOfId(id) != null;
/** A week's first and last days (Paris), { from, to } as YYYY-MM-DD; null for a bad id. */
export function weekDays(id) {
  const mon = mondayOfId(id);
  return mon == null ? null : { from: iso(mon), to: iso(mon + 6) };
}
/** A week's format: "ld" | "md" | "sprint", in turn week after week. */
export function weekFormat(id) {
  const mon = mondayOfId(id);
  return mon == null ? null : WEEK_FORMATS[(((mon - 4) / 7) % 3 + 3) % 3];
}
/** A week against an instant: "soon" (not begun), "open", "over". */
export function weekState(id, d = new Date()) {
  const w = weekDays(id), today = parisDate(d);
  return !w ? null : today < w.from ? "soon" : today > w.to ? "over" : "open";
}
/** The id of the week after (shift 1) or before (−1) a week. */
export const weekShift = (id, shift) => { const mon = mondayOfId(id); return mon == null ? null : idOfMonday(mon + shift * 7); };
