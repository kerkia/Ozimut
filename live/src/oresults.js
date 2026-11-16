// OResults (oresults.eu, 2026-11-16): a live results service MeOS, OE and SiTiming feed (Balise 77's Larchant of 15 November,
// Burgundy's, Provence's and Jura's clubs, Central Europe most). Read as its own public pages read it, while someone watches
// the race on « En direct »; none of its code. A race there is relayed as a SPORTident Center event is: the race's object
// reads the event's data and passes the classes that changed to the same `update`.
//
//   https://api.oresults.eu/events             every listed event: id, name, organizer / organization.name, date (UTC),
//                                              timezone, place, countryCode, isRelay, hasResults, hasStartList
//   https://cdn.oresults.eu/events/<id>/changes?since=<n>
//                                              the event's data since change n (0: all; 304 when nothing changed): classes
//                                              (name, radio controls), runners (className, name, club, cardNum, startTime,
//                                              finishTime — epoch ms —, resultStatus), punches (cardNum, code, punchTime;
//                                              code 4 the finish), lastChangeId
//
// Relays are not listed (their teams are another shape). Split times are the radio controls' punches only, as its live pages
// show them; the published split tables (after the race) are « Résultats »' (ffco_scraper/prov/sources/oresults.py).

export const HOST = "oresults.eu";
export const API = "https://api.oresults.eu";
export const CDN = "https://cdn.oresults.eu";
export const FROM = 500000000;                   // below SPORTident Center's (600 000 000); the event's own id added
export const isOr = (comp) => Number(comp) >= FROM && Number(comp) < FROM + 100000000;
export const raceId = (id) => FROM + Number(id);
export const eventOf = (comp) => Number(comp) - FROM;

const UA = "Ozimut-live/1.0 (+https://ozimut.com; one reader per competition, relayed to its spectators)";
const FINISH = 4;

/** The event's day in its own time zone (its date is UTC). */
export function localDay(e) {
  const t = Date.parse(e.date || "");
  if (!Number.isFinite(t)) return null;
  try { return new Date(t).toLocaleDateString("en-CA", { timeZone: e.timezone || "Europe/Paris" }); } catch (x) { return new Date(t).toISOString().slice(0, 10); }
}

/** The listed individual events from lo to hi (ISO days, their own): [{ id, name, organizer, date, country, timezone }]. */
export async function events(lo, hi) {
  const r = await fetch(`${API}/events`, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error(`oresults ${r.status}`);
  const out = [];
  for (const e of await r.json()) {
    const day = localDay(e);
    if (!e?.id || e.isRelay || !day || day < lo || day > hi) continue;
    const name = String(e.name || "").trim(), place = String(e.place || "").trim();
    out.push({ id: e.id, name: place && !name.toLowerCase().includes(place.toLowerCase()) ? `${name} - ${place}` : name,
      organizer: String(e.organization?.name || e.organizer || "").trim(), date: day, country: e.countryCode || null,
      timezone: e.timezone || null });
  }
  return out;
}

/** The event's data since change `since`: { status: 200 | 304, data }. */
export async function changes(id, since = 0) {
  const r = await fetch(`${CDN}/events/${id}/changes?since=${since}`, { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (r.status === 304) return { status: 304, data: null };
  if (!r.ok) throw new Error(`oresults ${r.status}`);
  return { status: 200, data: await r.json() };
}

/** The latest moment something happened in a payload (a finish, a punch), ms; null when none. */
export function lastActivity(data) {
  let t = 0;
  for (const x of data?.runners || []) if (Number(x.finishTime) > t) t = Number(x.finishTime);
  for (const p of data?.punches || []) if (Number(p.punchTime) > t) t = Number(p.punchTime);
  return t || null;
}

// resultStatus -> liveresultat's (0 OK, 1 DNS, 2 DNF, 3 MP, 4 DSQ, 5 overtime, 9 running, 10 not started, 12 not classified);
// those not shown at all: moved to another class, never entered
const STAT = { OK: 0, Finished: 0, MissingPunch: 3, DidNotFinish: 2, Disqualified: 4, OverTime: 5, DidNotStart: 1,
  NotCompeting: 12, SportingWithdrawal: 2, Active: 9, Inactive: 10 };
const SKIP = new Set(["Moved", "MovedUp", "DidNotEnter", "Cancelled"]);

/** The time zone's offset from UTC at a moment, ms. */
function offsetAt(tz, t) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(t / 1000) * 1000;
  } catch (e) { return 0; }
}

/**
 * The event's whole data -> the classes in the compact form « En direct » shows (liveresultat's: rows [place, name, club,
 * result, status, timeplus, progress, start, splits, provisional] in hundredths, splits [time, place, timeplus] per radio
 * control), one class per OResults class, in its order (« D10 » before « D12 », as its pages sort them).
 */
export function compact(data, now = Date.now()) {
  const ev = data.event || {}, tz = ev.timezone || "Europe/Paris";
  const off = offsetAt(tz, Date.parse(ev.date || "") || now);
  const clock = (ms) => Math.floor(((ms + off) / 1000) % 86400) * 100;
  const punches = new Map();
  for (const p of data.punches || []) {
    const k = String(p.cardNum);
    (punches.get(k) || punches.set(k, []).get(k)).push(p);
  }
  const byClass = new Map();
  for (const x of data.runners || []) {
    if (SKIP.has(x.resultStatus)) continue;
    (byClass.get(x.className) || byClass.set(x.className, []).get(x.className)).push(x);
  }
  const num = (s) => Number(String(s).match(/\d+/)?.[0] || 0);
  const pre = (s) => String(s).match(/\D+/)?.[0] || "";
  const list = (data.classes || []).filter((c) => !c.leg && byClass.has(c.name))
    .sort((a, b) => pre(a.name).localeCompare(pre(b.name)) || num(a.name) - num(b.name) || a.name.localeCompare(b.name));
  const out = {}, order = [];
  for (const c of list) {
    const radios = (c.controls || []).filter((k) => k && k.code != null && Number(k.code) !== FINISH);
    const controls = [];
    const seen = {};
    for (const k of radios) {
      const code = String(k.code);
      seen[code] = (seen[code] || 0) + 1;
      controls.push([seen[code] > 1 ? `${code}.${seen[code]}` : code, String(k.name || code)]);
    }
    const rows = byClass.get(c.name).map((x) => {
      const st0 = Number(x.startTime) || null, fin = Number(x.finishTime) || null;
      let status = STAT[x.resultStatus] ?? 10;
      if ((x.resultStatus === "OK" || x.resultStatus === "Finished") && !fin) status = st0 && st0 <= now ? 9 : 10;
      if (status === 10 && st0 && st0 <= now) status = 9;
      const result = status === 0 && fin && st0 && fin > st0 ? Math.round((fin - st0) / 10) : null;
      if (status === 0 && result == null) status = 9;
      // a radio control's time: the card's first punch there after the start (and after the previous control's)
      const mine = (punches.get(String(x.cardNum)) || []).filter((p) => !st0 || p.punchTime > st0).sort((a, b) => a.punchTime - b.punchTime);
      let from = 0;
      const times = radios.map((k) => {
        const i = mine.findIndex((p, j) => j >= from && String(p.code) === String(k.code));
        if (i < 0 || !st0) return null;
        from = i + 1;
        return Math.round((mine[i].punchTime - st0) / 10);
      });
      return { name: String(x.name || "").trim(), club: String(x.club || "").trim(), status, result,
        start: st0 ? clock(st0) : null, times, prel: x.resultStatus === "Finished" ? 1 : 0 };
    });
    const fin = rows.filter((x) => x.status === 0).map((x) => x.result).sort((a, b) => a - b);
    const per = controls.map((_, i) => rows.map((x) => x.times[i]).filter((t) => t != null).sort((a, b) => a - b));
    let name = String(c.name || `#${c.id}`).trim().slice(0, 120);
    while (out[name]) name += " ";
    order.push(name);
    out[name] = {
      controls,
      rows: rows.map((x) => [x.status === 0 ? fin.indexOf(x.result) + 1 : null, x.name, x.club, x.result, x.status,
        x.status === 0 ? x.result - fin[0] : null, null, x.start,
        controls.length ? x.times.map((t, i) => (t == null ? null : [t, per[i].indexOf(t) + 1, t - per[i][0]])) : null, x.prel]),
    };
  }
  return { order, classes: out, info: { name: String(ev.name || "").trim(), date: localDay(ev), timezone: tz } };
}

/** Is anyone out (running, or a finish not yet read) in the compact classes? */
export const anyOut = (classes) => Object.values(classes).some((k) => k.rows.some((r) => r[4] === 9 || r[9] === 1));
/** Is anyone still to start? */
export const anyWaiting = (classes) => Object.values(classes).some((k) => k.rows.some((r) => r[4] === 10));
