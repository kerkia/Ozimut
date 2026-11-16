// A date field's day written out in words in the site's language, under the field (owner, 2026-11-11: the browser draws its date
// fields in its own language's order — 10/11/2026 is 11 October in a browser set to English (US) — so a French reader typed
// 10/11 for 10 November and saved 11 October, the field showing « 10/11 » again when reopened). The words make the order plain,
// whatever order the browser chose. Since 2026-11-16 the fields themselves are written in the site's order (datefield.js).
import { locale } from "./i18n.js";
import { watch as watchFields } from "./datefield.js";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const words = (v) => (ISO.test(v) ? new Date(`${v}T00:00:00`).toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "");

/** Writes `input`'s day in words just after it (a span made the first time), now and whenever it changes. */
export function dateWords(input) {
  if (!input || input.type !== "date") return;
  // after the field's own box (datefield.js puts the field and its calendar button in one)
  const host = input.parentElement?.classList.contains("date-wrap") ? input.parentElement : input;
  let s = host.nextElementSibling;
  if (!s?.classList.contains("date-words")) {
    s = document.createElement("span");
    s.className = "date-words";
    s.setAttribute("aria-live", "polite");
    host.insertAdjacentElement("afterend", s);
  }
  s.textContent = words(input.value);
}

/** Every date field of the site in the site's order (datefield.js), and its words as soon as someone types or picks a day (app.start). */
export function watch() {
  watchFields();
  const on = (e) => { if (e.target instanceof HTMLInputElement && e.target.type === "date") dateWords(e.target); };
  document.addEventListener("input", on, true);
  document.addEventListener("change", on, true);
}
