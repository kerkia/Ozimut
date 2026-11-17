// Clock times on cards. A reader gives each time as it is stored: seconds within the day, or within 12 hours on the older
// SPORTident cards (`half`), sometimes with a weekday. The engine works in seconds after the event day's midnight (they may
// pass 86 400 for a night race): `unwrap` picks the 12- or 24-hour turn that puts a time after what came before it on the
// card, and `normaliseRead` does it for a whole card in the order a card is used — clear, check, start, controls, finish.
// An Emit card counts from its own zero (`rel`): its times are kept as they are.

export const DAY = 86400, HALF = 43200;

/** `{ t, half? }` as seconds after midnight, not earlier than `after` − `slack`. */
export function unwrap(x, after = 0, slack = 3600) {
  if (!x || x.t == null || !Number.isFinite(x.t)) return null;
  const period = x.half ? HALF : DAY, floor = after - slack;
  let s = ((x.t % period) + period) % period;
  if (s < floor) s += Math.ceil((floor - s) / period) * period;
  return Math.round(s * 10) / 10;
}

/** A reader's read (design.md) as the state keeps it: `{ card, sys, at, start, finish, check, clear, punches: [[code, s]], half?, rel? }`. */
export function normaliseRead(raw, zero = 0) {
  const out = { card: Number(raw.card), sys: raw.sys || "si", at: raw.at || Date.now(), family: raw.family || undefined };
  if (raw.rel) {
    // Emit: the race is what follows the last start unit (code 0) and precedes the first reader (codes 250-253); the
    // finish is the last unit punched before the reader, whether a finish unit or the course's last control
    out.rel = 1;
    let P = (raw.punches || []).map((p) => [Number(p.code), Math.round(p.t * 10) / 10]);
    const zero = P.map((p) => p[0]).lastIndexOf(0);
    if (zero >= 0) P = P.slice(zero + 1);
    const rd = P.findIndex((p) => p[0] >= 250 && p[0] <= 253);
    out.read = rd >= 0;
    if (rd >= 0) P = P.slice(0, rd);
    out.punches = P;
    out.start = 0;
    out.finish = rd >= 0 && P.length ? P[P.length - 1][1] : null;
    if (raw.readAt != null) out.readAt = raw.readAt;
    return out;
  }
  const first = Math.max(0, (zero || 0) - 4 * 3600);       // a card is cleared and checked up to a few hours before the first start
  out.clear = unwrap(raw.clear, first, 0);
  out.check = unwrap(raw.check, first, 0);
  let ref = Math.max(first, out.check ?? first);
  out.start = unwrap(raw.start, ref, 600);
  if (out.start != null) ref = Math.max(ref, out.start);
  out.punches = [];
  for (const p of raw.punches || []) {
    const s = unwrap(p, ref, 1800);                          // a unit whose clock is a little behind must not jump 12 hours ahead
    if (s == null) continue;
    out.punches.push([Number(p.code), s]);
    if (s > ref) ref = s;
  }
  out.finish = unwrap(raw.finish, ref, 1800);
  if ([raw.start, raw.finish, ...(raw.punches || [])].some((p) => p?.half)) out.half = 1;
  return out;
}

/** « 10:42:07 » from seconds after midnight (hours pass 24 after midnight). */
export function clock(s, { tenths = false } = {}) {
  if (s == null || !Number.isFinite(s)) return "";
  const neg = s < 0, a = Math.abs(s), h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), x = a % 60;
  const sec = tenths ? x.toFixed(1).padStart(4, "0") : String(Math.floor(x)).padStart(2, "0");
  return `${neg ? "-" : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${sec}`;
}
/** « 41:07 » or « 1:02:15 » from a duration in seconds. */
export function span(s) {
  if (s == null || !Number.isFinite(s)) return "";
  const neg = s < 0, a = Math.round(Math.abs(s)), h = Math.floor(a / 3600), m = Math.floor((a % 3600) / 60), x = a % 60;
  return `${neg ? "-" : ""}${h ? `${h}:${String(m).padStart(2, "0")}` : m}:${String(x).padStart(2, "0")}`;
}
/** Seconds from « 10:42 », « 10:42:07 », « 1:02:15.3 », « 10h42 »; null when it is no time. */
export function parseClock(text) {
  const m = /^\s*(-)?(\d{1,3})\s*[:h.]\s*(\d{1,2})(?:\s*[:m.']\s*(\d{1,2}(?:[.,]\d+)?))?\s*$/i.exec(String(text ?? ""));
  if (!m) return null;
  const s = Number(m[2]) * 3600 + Number(m[3]) * 60 + (m[4] ? Number(m[4].replace(",", ".")) : 0);
  return m[1] ? -s : s;
}
/** A duration « 41:07 » (minutes:seconds) or « 1:02:15 »; null when it is none. */
export function parseSpan(text) {
  const p = String(text ?? "").trim().split(":").map((x) => x.replace(",", "."));
  if (!p.length || p.length > 3 || p.some((x) => x === "" || !Number.isFinite(Number(x)))) return null;
  return p.reduce((s, x) => s * 60 + Number(x), 0);
}
