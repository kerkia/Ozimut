// Chrono's screens: the small parts every post uses — icons, a dialog with a form, a toast, a file picker, a download,
// a sortable table. Texts come from the catalogue `chrono` (keys `chr.*`).

import { html, raw, esc } from "../../util.js";
import { t, locale } from "../../i18n.js";

/** The time of day of an instant, as the reader's language writes it (24 hours). */
export const atClock = (ms) => new Date(ms).toLocaleTimeString(locale(), { hour12: false });

const P = {
  wand: "M4 20 15 9M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 12l.6 1.4L21 14l-1.4.6L19 16l-.6-1.4L17 14l1.4-.6z",
  desk: "M4 7h16v4H4zM6 11v8M18 11v8M9 15h6",
  go: "M6 4v16M6 5h11l-2.5 3.5L17 12H6",
  flag: "M5 21V4M5 5h13v8H5M5 9h13M11.5 5v8",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  mic: "M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11a6 6 0 0 0 12 0M12 17v4M9 21h6",
  scale: "M12 4v16M7 20h10M5 8h14M5 8l-2.5 6a2.5 2.5 0 0 0 5 0zM19 8l-2.5 6a2.5 2.5 0 0 0 5 0z",
  box: "M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8",
  lock: "M6 11h12v9H6zM9 11V8a3 3 0 0 1 6 0v3",
  plus: "M12 5v14M5 12h14",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  trash: "M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13",
  print: "M7 9V4h10v5M7 17H4v-6h16v6h-3M7 14h10v6H7z",
  up: "M12 16V5M7 9l5-5 5 5M5 20h14",
  down: "M12 4v11M7 11l5 5 5-5M5 20h14",
  plug: "M9 3v5M15 3v5M7 8h10v3a5 5 0 0 1-10 0zM12 16v5",
  cloud: "M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 9.5 4.2 4.2 0 0 1 17.5 18z",
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 4l9 16H3zM12 10v5M12 17.5v.5",
  x: "M6 6l12 12M18 6L6 18",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l4.5 4.5",
  list: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01",
  dice: "M5 5h14v14H5zM9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2",
  card: "M4 6h16v12H4zM4 10h16M7 15h4",
  file: "M7 3h7l4 4v14H7zM14 3v4h4",
  play: "M7 5l12 7-12 7z",
  stop: "M6 6h12v12H6z",
  user: "M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21a8 8 0 0 1 16 0",
  users: "M9 5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20a6.5 6.5 0 0 1 13 0M16 5.5a3 3 0 0 1 0 6M18 14.5a6 6 0 0 1 3.5 5.5",
  radio: "M12 13a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM12 16v5M8 11a5.5 5.5 0 0 1 8 0M5 8a10 10 0 0 1 14 0",
  coins: "M9 5c3 0 5 1 5 2.5S12 10 9 10 4 9 4 7.5 6 5 9 5zM4 7.5v4C4 13 6 14 9 14M14 11c3 0 6 1 6 2.5S17 16 14 16s-5-1-5-2.5M9 13.5v4c0 1.500 2 2.500 5 2.500s6-1 6-2.500v-4",
  undo: "M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12",
  link: "M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1",
  tv: "M3 6h18v11H3zM8 21h8M12 17v4",
  gear: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M5.600 18.400l2.100-2.100M16.300 7.700l2.100-2.100",
  swap: "M4 8h13l-3-3M20 16H7l3 3",
};
/** An icon of the set, as markup. */
export const icon = (name, size = 18) => raw(`<svg class="chr-ic" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${P[name] || P.check}"/></svg>`);

/** A toast at the bottom of Chrono's window: `kind` "ok" | "warn" | "stop" | "". */
export function toast(root, message, kind = "") {
  let box = root.querySelector(".chr-toasts");
  if (!box) { box = document.createElement("div"); box.className = "chr-toasts"; box.setAttribute("aria-live", "polite"); root.append(box); }
  const el = document.createElement("div");
  el.className = `chr-toast ${kind}`;
  el.textContent = message;
  box.append(el);
  while (box.children.length > 3) box.firstElementChild.remove();           // a burst of cards: the last three are enough
  setTimeout(() => el.remove(), kind === "stop" ? 9000 : 4500);
}

/**
 * A dialog holding a form. `body`: markup; `onOpen(dlg)` wires it; `onOk(dlg)` returns the result, or `false` to stay open
 * (after showing why). Resolves to that result, or null when given up. Answers from its buttons and Escape.
 */
export function formDialog({ title, body, ok = t("chr.ok"), cancel = t("chr.cancel"), onOpen = null, onOk = null, wide = false, danger = false, extra = "" }) {
  return new Promise((resolve) => {
    const dlg = document.createElement("dialog");
    dlg.className = `chr-dlg${wide ? " wide" : ""}`;
    dlg.innerHTML = html`<form method="dialog" class="chr-dlg-form"><h3>${title}</h3><div class="chr-dlg-body">${raw(String(body))}</div>
      <p class="chr-dlg-err" hidden></p>
      <div class="chr-dlg-foot">${raw(String(extra))}<span class="grow"></span>${cancel ? html`<button type="button" class="btn" data-x>${cancel}</button>` : ""}
      ${ok ? html`<button type="submit" class="btn ${danger ? "btn-danger" : "btn-primary"}">${ok}</button>` : ""}</div></form>`.toString();
    let done = false;
    const end = (v) => { if (done) return; done = true; dlg.close(); dlg.remove(); resolve(v); };
    dlg.fail = (msg) => { const p = dlg.querySelector(".chr-dlg-err"); p.textContent = msg; p.hidden = !msg; };
    dlg.end = end;
    dlg.querySelector("[data-x]")?.addEventListener("click", () => end(null));
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); end(null); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) end(null); });
    dlg.querySelector("form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try { const v = onOk ? await onOk(dlg) : true; if (v !== false) end(v ?? true); } catch (err) { dlg.fail(err?.message || String(err)); }
    });
    document.body.append(dlg);
    dlg.showModal();
    onOpen?.(dlg);
    (dlg.querySelector("[autofocus]") || dlg.querySelector("input, select, textarea, button[type=submit]"))?.focus();
  });
}

/** A form's values by field name (numbers for `data-num`, booleans for checkboxes, "" trimmed). */
export function values(root) {
  const out = {};
  for (const el of root.querySelectorAll("[name]")) {
    if (el.type === "checkbox") out[el.name] = el.checked;
    else if (el.type === "radio") { if (el.checked) out[el.name] = el.value; }
    else if (el.dataset.num != null) out[el.name] = el.value.trim() === "" ? null : Number(el.value.replace(",", "."));
    else out[el.name] = el.value.trim();
  }
  return out;
}

/** A labelled field as markup: `field(label, inputMarkup, hint?)`. */
export const field = (label, input, hint = "") => html`<label class="chr-f"><span>${label}</span>${raw(String(input))}${hint ? html`<small>${hint}</small>` : ""}</label>`;
export const opt = (value, label, sel) => html`<option value="${value}" ${String(sel ?? "") === String(value) ? raw("selected") : ""}>${label}</option>`;

/** The user picks files: resolves to an array of File (empty when given up). */
export function pickFiles(accept = "", multiple = false) {
  return new Promise((resolve) => {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = accept; inp.multiple = multiple;
    inp.addEventListener("change", () => resolve([...inp.files]));
    inp.addEventListener("cancel", () => resolve([]));
    inp.click();
  });
}
/** A file handed to the user. */
export function download(name, data, type = "application/octet-stream") {
  if (window.chronoApp?.saveFile) { window.chronoApp.saveFile(name, data); return; }
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
/** A page printed: by the app without a dialog, else through a hidden frame and the browser's print dialog. */
export async function printHtml(page, { silent = false, printer = "", widthMm = 0 } = {}) {
  if (window.chronoApp?.print) return window.chronoApp.print(page, { silent, printer, widthMm });
  const fr = document.createElement("iframe");
  fr.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.append(fr);
  fr.srcdoc = page;
  await new Promise((ok) => { fr.onload = ok; });
  fr.contentWindow.focus();
  fr.contentWindow.print();
  setTimeout(() => fr.remove(), 60000);
  return { ok: true };
}
/** A page opened in a tab of its own (a list for a wall screen). */
export function openPage(page) {
  const url = URL.createObjectURL(new Blob([page], { type: "text/html" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}

/**
 * A table: `cols` [{ key, label, num?, get(row) → text, cell?(row) → markup, sort?(row) → value }], `rows`, `id(row)`;
 * a click on a heading sorts; `state` { sort, dir } is kept by the caller between draws.
 */
export function table(cols, rows, { id = (r) => r.id, state = {}, cls = "", empty = "", rowCls = null } = {}) {
  const c = cols.find((x) => x.key === state.sort);
  if (c) {
    const val = c.sort || c.get, dir = state.dir === "desc" ? -1 : 1;
    rows = [...rows].sort((a, b) => { const x = val(a), y = val(b); return (x == null || x === "" ? 1 : y == null || y === "" ? -1 : typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir; });
  }
  if (!rows.length) return html`<p class="chr-empty">${empty}</p>`;
  return html`<div class="table-wrap chr-tw"><table class="data chr-t ${cls}"><thead><tr>${cols.map((x) => html`<th class="${x.num ? "num" : ""}" data-sort="${x.key}" aria-sort="${state.sort === x.key ? (state.dir === "desc" ? "descending" : "ascending") : "none"}">${x.label}</th>`)}</tr></thead>
    <tbody>${rows.map((r) => html`<tr data-id="${id(r)}" class="${rowCls ? rowCls(r) : ""}">${cols.map((x) => html`<td class="${x.num ? "num" : ""}">${x.cell ? x.cell(r) : x.get(r) ?? ""}</td>`)}</tr>`)}</tbody></table></div>`;
}
/** Wires a table drawn by `table`: sorting (then `redraw`) and a click on a row. */
export function bindTable(root, state, redraw, onRow = null) {
  root.querySelectorAll("th[data-sort]").forEach((th) => th.addEventListener("click", () => {
    if (state.sort === th.dataset.sort) state.dir = state.dir === "desc" ? "asc" : "desc"; else { state.sort = th.dataset.sort; state.dir = "asc"; }
    redraw();
  }));
  if (onRow) root.querySelectorAll("tbody tr[data-id]").forEach((tr) => tr.addEventListener("click", (e) => { if (!e.target.closest("button, a, input, select")) onRow(tr.dataset.id, e); }));
}

export const statusTag = (s) => html`<span class="chr-st chr-st-${s}">${t(`chr.st.${s}`)}</span>`;
export { html, raw, esc };
