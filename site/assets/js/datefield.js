// Date fields in the site's language (owner, 2026-11-16: « for dates, when in French, use the French convention: day/month/year,
// not the English one — across Ozimut »). A browser draws <input type="date"> in its own language's order, whatever the page's
// (a browser in English (US) shows 11/22/2026), and no page can change that. So every date and date-time field of the site is
// turned, as soon as it is in the page, into a text field written in the site's order — 22/11/2026 in French and Spanish and in
// English (en-GB), 22.11.2026 in German, a time after it « 22/11/2026 20:00 » — beside a calendar button that opens the browser's
// own picker. The code keeps reading and writing ISO values: the field's `value` is "YYYY-MM-DD" (or "YYYY-MM-DDTHH:MM"), "" while
// what is typed is not a whole valid day, its `type` still "date" (or "datetime-local"), and a form's FormData gets the ISO value.

import { t, locale } from "./i18n.js";

const SEL = 'input[type="date"]:not([data-df]), input[type="datetime-local"]:not([data-df])';
const NATIVE = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
const ISO_D = /^(\d{4})-(\d{2})-(\d{2})$/, ISO_DT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;
const ICON = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';

/** The site's order of day, month and year, and their separator (from the language's own way of writing a day). */
let PAT = null;
function pattern() {
  const loc = locale();
  if (PAT?.loc === loc) return PAT;
  const parts = new Intl.DateTimeFormat(loc, { day: "2-digit", month: "2-digit", year: "numeric" }).formatToParts(new Date(2026, 10, 22));
  const order = parts.filter((p) => p.type === "day" || p.type === "month" || p.type === "year").map((p) => p.type);
  const sep = parts.find((p) => p.type === "literal")?.value.trim() || "/";
  return (PAT = { loc, order: order.length === 3 ? order : ["day", "month", "year"], sep });
}
const pad = (n) => String(n).padStart(2, "0");
/** ISO → as written in the site's language ("" for anything else). */
function format(iso, kind) {
  const m = (kind === "datetime" ? ISO_DT : ISO_D).exec(String(iso || ""));
  if (!m) return "";
  const { order, sep } = pattern(), v = { year: m[1], month: m[2], day: m[3] };
  return order.map((k) => v[k]).join(sep) + (kind === "datetime" ? ` ${m[4]}:${m[5]}` : "");
}
/** As typed (any separators, or the digits run together) → ISO, or "" when it is not a whole valid day (and time). */
function parse(text, kind) {
  const s = String(text || "").trim();
  if (!s) return "";
  let g = s.match(/\d+/g) || [];
  // the digits run together: « 22112026 » (and « 2211202620 30 » …)
  if (g.length && g[0].length >= 6 && g[0].length <= 8) {
    const d = g[0], y = d.length === 8 ? 4 : 2, { order } = pattern(), out = [];
    let i = 0;
    for (const k of order) { const n = k === "year" ? y : 2; out.push(d.slice(i, i + n)); i += n; }
    g = [...out, ...g.slice(1)];
  }
  if (g.length < 3) return "";
  const { order } = pattern(), v = {};
  order.forEach((k, i) => { v[k] = Number(g[i]); });
  if (String(g[order.indexOf("year")]).length <= 2) v.year += 2000;
  const date = new Date(v.year, v.month - 1, v.day);
  if (!(v.year >= 1900 && v.year <= 2200) || date.getMonth() !== v.month - 1 || date.getDate() !== v.day) return "";
  const iso = `${v.year}-${pad(v.month)}-${pad(v.day)}`;
  if (kind !== "datetime") return iso;
  if (g.length < 4) return "";
  const h = Number(g[3]), mi = g.length > 4 ? Number(g[4]) : 0;
  if (!(h >= 0 && h <= 23 && mi >= 0 && mi <= 59)) return "";
  return `${iso}T${pad(h)}:${pad(mi)}`;
}
/** « jj/mm/aaaa » in French, « dd/mm/yyyy » in English, « TT.MM.JJJJ » in German, « dd/mm/aaaa » in Spanish (+ « hh:mm »). */
function placeholder(kind) {
  const { order, sep } = pattern(), w = { day: t("df.ph.day"), month: t("df.ph.month"), year: t("df.ph.year") };
  return order.map((k) => w[k]).join(sep) + (kind === "datetime" ? ` ${t("df.ph.time")}` : "");
}

/** One field turned into the site's own: its value, type, calendar button, and the day reformatted once typed. */
function upgrade(el) {
  if (el.dataset.df) return;
  const kind = el.getAttribute("type") === "datetime-local" ? "datetime" : "date";
  const iso = NATIVE.get.call(el);
  el.dataset.df = kind;
  el.setAttribute("type", "text");
  el.classList.add("date-field", `date-field-${kind}`);
  el.inputMode = "numeric";
  el.autocomplete = "off";
  el.spellcheck = false;
  if (!el.placeholder) el.placeholder = placeholder(kind);
  Object.defineProperty(el, "value", {
    configurable: true,
    get() { return parse(NATIVE.get.call(this), kind); },
    set(v) { const s = String(v ?? ""); NATIVE.set.call(this, ISO_D.test(s) || ISO_DT.test(s) ? format(kind === "datetime" && ISO_D.test(s) ? `${s}T00:00` : s, kind) : s); },
  });
  Object.defineProperty(el, "type", { configurable: true, get: () => (kind === "datetime" ? "datetime-local" : "date"), set() {} });
  el.value = iso;

  // the calendar: the browser's own picker, on a native field kept out of sight beside the button
  const wrap = document.createElement("span");
  wrap.className = "date-wrap";
  el.replaceWith(wrap);
  const nat = document.createElement("input");
  nat.type = kind === "datetime" ? "datetime-local" : "date";
  nat.className = "date-native";
  nat.tabIndex = -1;
  nat.setAttribute("aria-hidden", "true");
  nat.dataset.df = "native";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "date-pick";
  btn.title = t("df.pick");
  btn.setAttribute("aria-label", t("df.pick"));
  btn.innerHTML = ICON;
  wrap.append(el, btn, nat);
  const open = () => {
    if (el.disabled || el.readOnly) return;
    NATIVE.set.call(nat, el.value);
    for (const a of ["min", "max", "step"]) { const v = el.getAttribute(a); if (v) nat.setAttribute(a, v); else nat.removeAttribute(a); }
    try { nat.showPicker(); } catch (e) { nat.focus(); nat.click(); }
  };
  btn.addEventListener("click", open);
  nat.addEventListener("change", () => {
    el.value = NATIVE.get.call(nat);
    el.removeAttribute("aria-invalid");
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.focus();
  });
  el.addEventListener("keydown", (e) => { if ((e.altKey && e.key === "ArrowDown") || e.key === "F4") { e.preventDefault(); open(); } });
  // once left: written again in the site's order, or marked when it is not a day
  el.addEventListener("blur", () => {
    const txt = NATIVE.get.call(el).trim(), v = parse(txt, kind);
    if (v) { NATIVE.set.call(el, format(v, kind)); el.removeAttribute("aria-invalid"); }
    else if (txt) el.setAttribute("aria-invalid", "true");
    else el.removeAttribute("aria-invalid");
  });
  const sync = () => { btn.disabled = el.disabled; };
  sync();
  new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ["disabled"] });
}

const scan = (root) => {
  if (root.matches?.(SEL)) upgrade(root);
  root.querySelectorAll?.(SEL).forEach(upgrade);
};
/** Every date field of the site, now and to come (app.start, through datewords.watch). */
export function watch() {
  scan(document);
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n); })
    .observe(document.documentElement, { childList: true, subtree: true });
  // a form read as FormData gets the ISO value, not the words shown (Mes cartes' dialogs)
  document.addEventListener("formdata", (e) => {
    for (const el of e.target.querySelectorAll?.("input[data-df]:not([data-df=native])") || []) if (el.name && !el.disabled) e.formData.set(el.name, el.value);
  }, true);
}
export { format as formatDay, parse as parseDay };
