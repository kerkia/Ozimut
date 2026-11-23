// An entry's price (docs/clubs/design.md §4 « Prices »; owner, 2026-11-22): pure, shared by the browser (the Orga tab's grid and
// its preview, the runners' form) and the Functions (functions/_lib/entries.js fixes the price on the entry when it is made).
// Amounts are in cents. The rules, `entry_forms.prices`:
//   { currency: "EUR",
//     bands: [{ label, maxAge?, minAge?, licensed?: true|false, amount }],  // the first band that fits (age = race year − birth year)
//     classes: { <class id>: amount },                                    // a class's own price overrides the bands
//     rent: 0, late: 0,                                                   // a rented card; an entry after the closing until late_until
//     options: [{ id, label, amount }],
//     family_cap: 0,                                                      // one payer's entries for the event never above it (0: none)
//     own_free: false }                                                   // the organising club's members enter free
// A price's parts are [label, cents]: a band's or an option's own label (the organisers'), or a code the pages word —
// "@class", "@rent", "@late", "@own", "@cap", "@none" (no band fits).

export const CURRENCIES = ["EUR", "CHF", "GBP", "USD", "CAD", "SEK", "NOK", "DKK", "CZK", "PLN", "HUF", "AUD", "NZD"];
const cents = (x) => { const n = Math.round(Number(x)); return Number.isFinite(n) && n > 0 ? Math.min(n, 1e7) : 0; };
const label = (s, n = 40) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const age = (n) => { const x = Math.round(Number(n)); return Number.isFinite(x) && x >= 0 && x <= 120 ? x : null; };

/** The rules checked and cleaned (unknown fields dropped, amounts whole cents ≥ 0). */
export function cleanRules(r = {}) {
  r = r && typeof r === "object" ? r : {};
  const currency = CURRENCIES.includes(r.currency) ? r.currency : "EUR";
  const bands = (Array.isArray(r.bands) ? r.bands : []).slice(0, 20).map((b) => {
    const o = { label: label(b?.label), amount: cents(b?.amount) };
    const mx = age(b?.maxAge), mn = age(b?.minAge);
    if (b?.maxAge != null && b.maxAge !== "" && mx != null) o.maxAge = mx;
    if (b?.minAge != null && b.minAge !== "" && mn != null) o.minAge = mn;
    if (b?.licensed === true || b?.licensed === false) o.licensed = b.licensed;
    return o;
  });
  const classes = {};
  for (const [k, v] of Object.entries(r.classes && typeof r.classes === "object" ? r.classes : {}).slice(0, 80)) {
    if (/^[\w-]{1,16}$/.test(k) && v !== "" && v != null && Number.isFinite(Number(v))) classes[k] = Math.max(0, Math.round(Number(v)));
  }
  const ids = new Set();
  const options = (Array.isArray(r.options) ? r.options : []).slice(0, 12).map((o) => ({ id: label(o?.id, 12).replace(/[^\w-]/g, ""), label: label(o?.label, 60), amount: cents(o?.amount) }))
    .filter((o) => o.id && o.label && !ids.has(o.id) && ids.add(o.id));
  return { currency, bands, classes, rent: cents(r.rent), late: cents(r.late), options, family_cap: cents(r.family_cap), own_free: r.own_free === true };
}

/** A runner's age in the race's year (null when the year of birth is unknown). */
export const ageOf = (birthYear, year) => (Number(birthYear) > 1900 && Number(year) ? Number(year) - Number(birthYear) : null);

/** Does a band take this runner? An age bound needs the runner's year of birth; « licensed » needs to know. */
export function fits(b, runner, year) {
  const a = ageOf(runner.birth_year, year);
  if (b.maxAge != null && (a == null || a > b.maxAge)) return false;
  if (b.minAge != null && (a == null || a < b.minAge)) return false;
  if (b.licensed === true && !runner.licence) return false;
  if (b.licensed === false && runner.licence) return false;
  return true;
}

/**
 * The price of one entry. `runner`: { birth_year, licence, class_id, rent, options: [ids], own (a member of the organising
 * club) }; `ctx`: { year (the race's), late (entered after the closing) }. -> { cents, parts: [[label, cents]…] }
 */
export function priceOf(rules, runner = {}, ctx = {}) {
  const R = cleanRules(rules), parts = [];
  if (R.own_free && runner.own) return { cents: 0, parts: [["@own", 0]] };
  const own = runner.class_id != null && Object.prototype.hasOwnProperty.call(R.classes, runner.class_id) ? R.classes[runner.class_id] : null;
  if (own != null) parts.push(["@class", own]);
  else {
    const b = R.bands.find((x) => fits(x, runner, ctx.year));
    parts.push(b ? [b.label || "@class", b.amount] : ["@none", 0]);
  }
  if (runner.rent && R.rent) parts.push(["@rent", R.rent]);
  if (ctx.late && R.late) parts.push(["@late", R.late]);
  const picked = new Set(Array.isArray(runner.options) ? runner.options : []);
  for (const o of R.options) if (picked.has(o.id)) parts.push([o.label, o.amount]);
  return { cents: parts.reduce((s, p) => s + p[1], 0), parts };
}

/**
 * The family cap spread: one payer's entries for the event never above `family_cap`. `entries`: [{ cents, fixed }] — the
 * entries already made (fixed: counted, never changed) and the new ones, in order. Returns the new prices, the last entries
 * lowered first: [{ cents, cut }] for each entry (a fixed one as it was, cut 0).
 */
export function capFamily(rules, entries) {
  const cap = cleanRules(rules).family_cap;
  const out = entries.map((e) => ({ cents: Math.max(0, Math.round(Number(e.cents) || 0)), cut: 0 }));
  if (!cap) return out;
  let over = out.reduce((s, e) => s + e.cents, 0) - cap;
  for (let i = entries.length - 1; i >= 0 && over > 0; i--) {
    if (entries[i].fixed) continue;
    const c = Math.min(out[i].cents, over);
    out[i].cents -= c; out[i].cut = c; over -= c;
  }
  return out;
}

/** An amount as the reader's language writes it: « 12,50 € », "€12.50". */
export function fmtMoney(c, currency = "EUR", locale = "fr-FR") {
  const n = (Number(c) || 0) / 100;
  try { return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: n % 1 ? 2 : 0 }).format(n); }
  catch (e) { return `${n.toFixed(2)} ${currency}`; }
}
/** « 12,50 » typed -> 1250 cents; null when it is no amount. */
export function parseMoney(s) {
  const x = String(s ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (x === "") return 0;
  return /^\d+(\.\d{1,2})?$/.test(x) ? Math.round(Number(x) * 100) : null;
}
/** Cents written for a field: 1250 -> « 12.50 », 1200 -> « 12 ». */
export const moneyField = (c) => (c ? (c % 100 ? (c / 100).toFixed(2) : String(c / 100)) : "");

/** Three typical entrants for the grid's preview (the race's year): a licensed adult, a licensed 14-year-old, an adult without licence. */
export const typical = (year) => [
  { key: "adult", birth_year: year - 35, licence: "1", rent: 0 },
  { key: "young", birth_year: year - 14, licence: "1", rent: 0 },
  { key: "open", birth_year: year - 35, licence: "", rent: 1 },
];
