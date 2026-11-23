// What a runner is to Ozimut's start times and entries (owner, 2026-11-03, then 2026-11-22): the Paris clock the closings are
// written in, a runner's club as kept, the club key the gap rule compares, and the person entered once per competition. The
// start-time booking of 2026-11-03 (migration 0023's booking_events and bookings) became the entries' start times
// (docs/clubs/design.md §3; _lib/entries.js, api/entries); its « Mes coureurs » (booking_runners) stays.

/** Now in Paris, "YYYY-MM-DDTHH:MM" (the settings' closing time is written so). */
export const parisNow = () => new Date().toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).slice(0, 16).replace(" ", "T");
export const parisDay = (plus = 0) => {
  const d = new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" })}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + plus);
  return d.toISOString().slice(0, 10);
};
export const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
/** A name or club as compared: lower case, accents and punctuation gone. */
export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** A runner's club as kept: { club_country, club_code, club_name } cleaned (France's number four digits). */
export function clubOf(x = {}) {
  const cc = /^[A-Z]{2}$/.test(String(x.club_country || "")) ? String(x.club_country) : "";
  let code = clean(x.club_code, 12);
  if (cc === "FR") code = /^\d{3,4}$/.test(code) ? code.padStart(4, "0") : "";
  return { club_country: cc, club_code: cc ? code : "", club_name: cc ? clean(x.club_name, 80) : "" };
}
/** The club the gap rule compares: « FR:0109 » (a federation's number), else the country and the name; '' without a club. */
export function clubKey(c) {
  if (!c.club_country) return "";
  if (c.club_code) return `${c.club_country}:${c.club_code}`;
  const n = norm(c.club_name);
  return n ? `${c.club_country}:${n}` : "";
}
/** Who runs, to enter them once a competition: their licence, else their name and club. */
export const personOf = (r, key) => (r.licence ? `L${r.licence}` : `N${norm(`${r.first_name} ${r.last_name}`)}|${key}`);
