// « Virtually »'s runs (api/virtual): a runner is told apart in the results by a hash of their account's number, never the
// number itself. Also what api/virtual, api/virtual/events and api/virtual/comp share about competitions (docs/pixel/competitions.md):
// who may enter them, an event's record and conditions, and when a competition is over (its routes then open to all).
import { isAdmin } from "./api.js";
import { isWeek, parisDate, weekDays } from "../../site/assets/js/games/vweekid.js";

/** The account's hash in the results (12 hex digits of SHA-256 over the account's number and the site's secret). */
export async function runnerHash(env, uid) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`virtually|${uid}|${env.SESSION_SECRET || ""}`));
  return [...new Uint8Array(d)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Pixel's competitions (the comp API, the week's race): the administrators' only for now (owner, 2026-11-28); opening them to
 *  all = this line (and games/vnext.js pixelNext in the browser). */
export const compAllowed = (env, user) => !!user && isAdmin(env, user);

export const EVENT_ID = /^e[a-z0-9]{9}$/;
/** An organiser's event record (api/virtual/events: virtual-events/<id>.json), or null. */
export async function readEvent(env, id) {
  if (!EVENT_ID.test(id || "")) return null;
  const o = await env.BUCKET.get(`virtual-events/${id}.json`);
  return o ? o.json().catch(() => null) : null;
}

/** The race's conditions, as games/vweather.js knows them (anything else: a clear day, no season). */
export function cleanEnv(e) {
  const pick = (v, list) => (list.includes(v) ? v : list[0]);
  return { weather: pick(e?.weather, ["clear", "overcast", "rain", "fog", "snow"]), time: pick(e?.time, ["day", "dusk", "night"]),
    lamp: pick(e?.lamp, ["normal", "strong"]), season: pick(e?.season, ["", "spring", "summer", "autumn", "winter"]) };
}

/** An event's state against Paris's day: "soon", "open", "over" (a side without a date is open-ended). */
export function eventState(ev, today = parisDate()) {
  return ev?.from && today < ev.from ? "soon" : ev?.to && today > ev.to ? "over" : "open";
}
/** Is this race (an event's id or a week's) a competition whose last day is past, in Paris? An event without an end date, a
 *  built-in map or a « Carte du jour » is never over. `ev` the event's record when already read. */
export async function raceOver(env, race, ev) {
  const today = parisDate();
  if (isWeek(race)) return weekDays(race).to < today;
  if (!EVENT_ID.test(race || "")) return false;
  const e = ev === undefined ? await readEvent(env, race) : ev;
  return !!e?.to && e.to < today;
}
/** May everyone read the routes of this race's competition runs: over, or during it when its organiser allowed ghosts? */
export async function compRoutesOpen(env, race) {
  if (isWeek(race)) return raceOver(env, race);
  if (!EVENT_ID.test(race || "")) return false;
  const ev = await readEvent(env, race);
  return !!ev?.ghosts || (await raceOver(env, race, ev));
}
