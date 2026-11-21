// This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. If a copy of the MPL was not
// distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.

// Markup built safely: names, clubs and titles come from files and card readers, so nothing reaches innerHTML without
// going through html``, which escapes every value unless it is wrapped in raw().

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (v) => (v == null ? "" : String(v).replace(/[&<>"']/g, (c) => ESC[c]));

class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
/** Markup trusted as it is. */
export const raw = (s) => new Raw(s == null ? "" : String(s));

function render(v) {
  if (v instanceof Raw) return v.s;
  if (Array.isArray(v)) return v.map(render).join("");
  if (v == null || v === false) return "";
  return esc(v);
}

/** Tagged template: every interpolation escaped, arrays joined, null and false left out. */
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += render(vals[i]) + strings[i + 1];
  return raw(out);
}
