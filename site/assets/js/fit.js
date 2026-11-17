/* Tables that scroll fit in the window (owner, 2026-10-22: a table taller than the space left under it scrolled inside the
   page's own scroll — two vertical scrollbars side by side, and its horizontal one out of sight until the page was
   scrolled down). Each box a table scrolls in gets, as --table-fit, the height from its top to the window's bottom when
   the page is at its top; one too low on the page for that gets the window less the site's bar (it then fits once the
   page is scrolled to it). A box that overflows is marked fit-over: a frame and a visible scrollbar track. A box whose
   page lets it grow (max-height: none, as « En direct ») keeps the page's single scrollbar. */

const SEL = ".table-wrap, .table-scroll, .scroll-box, .agenda-table";
const GAP = 14;                            // px kept under a box, so that its lower edge shows

// A table's frozen columns (app.css « Frozen columns », ui.freezeAttrs): the second and third stick where the ones before
// them end, measured on the header row (owner, 2026-10-24)
const FROZEN = "table[data-freeze]";
function freezeOffsets(main) {
  for (const tb of main.querySelectorAll(FROZEN)) {
    if (!tb.offsetParent) continue;
    let row = null;                          // (the first row without a merged cell: not a copy of a long table's rows)
    for (const r of tb.rows) if (![...r.cells].some((c) => c.colSpan > 1)) { row = r; break; }
    if (!row || row.cells.length < 2) continue;
    // (widths, not positions: a stuck cell's position moves with the scroll)
    for (const i of [1, 2]) {
      const v = row.cells[i] ? `${[...row.cells].slice(0, i).reduce((s, c) => s + c.getBoundingClientRect().width, 0)}px` : "";
      if (tb.style.getPropertyValue(`--fz${i + 1}`) !== v) tb.style.setProperty(`--fz${i + 1}`, v);
    }
  }
}

function fitAll() {
  const main = document.getElementById("main");
  if (!main) return;
  freezeOffsets(main);
  const vh = window.innerHeight, bar = document.querySelector(".topbar")?.offsetHeight || 0;
  const min = Math.min(220, vh * 0.35);    // (some six rows: below that the page is scrolled to the table instead)
  const boxes = [...main.querySelectorAll(SEL)].filter((el) => el.offsetParent);           // (hidden ones apart)
  // a box holding another (the runner's history around its table) lets it scroll alone: one scrollbar, not two
  for (const el of boxes) el.classList.toggle("fit-outer", boxes.some((b) => b !== el && el.contains(b)));
  for (const el of boxes) {
    if (el.classList.contains("fit-outer")) continue;
    const cs = getComputedStyle(el);
    if (cs.maxHeight === "none" || !/auto|scroll/.test(cs.overflowY)) continue;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const room = vh - top - GAP;
    const h = Math.round(room >= min ? room : vh - bar - GAP - 10);
    if (el.dataset.fit !== String(h)) { el.dataset.fit = h; el.style.setProperty("--table-fit", `${h}px`); }
    el.classList.toggle("fit-over", el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
  }
}

let queued = false;
/** A fit at the next frame (a page drawn, a tab shown, rows added). */
export function fitTables() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; fitAll(); });
}

/** Watches the page: what is drawn into #main, and the window's size (a phone's address bar showing or hiding changes
 *  the height by a few tens of pixels: not refitted for that). */
export function watchTables() {
  const main = document.getElementById("main");
  if (!main) return;
  // What is news (2026-11-17: every class and style change in the page was — a row under the mouse, a replay's runner moving
  // at each tick — and all the tables were measured again at the next frame): elements added or removed (not a text
  // rewritten, a clock); something shown, hidden, opened or closed; a class or style changed on what holds a table. The
  // fit's own changes — a box's style, data-fit and class — are not; a part that only grows or shrinks beside the tables
  // is seen by the page's height (below).
  const BOXES = `${SEL}, ${FROZEN}`;
  const news = (m) => {
    if (m.type === "childList") { for (const n of m.addedNodes) if (n.nodeType === 1) return true; for (const n of m.removedNodes) if (n.nodeType === 1) return true; return false; }
    if (m.target.matches?.(BOXES)) return false;
    return m.attributeName === "hidden" || m.attributeName === "open" || !!m.target.querySelector?.(BOXES);
  };
  new MutationObserver((list) => { if (list.some(news)) fitTables(); })
    .observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "hidden", "style", "open"] });
  if (window.ResizeObserver) new ResizeObserver(fitTables).observe(main);
  let w = window.innerWidth, h = window.innerHeight;
  window.addEventListener("resize", () => {
    if (window.innerWidth === w && Math.abs(window.innerHeight - h) < 100) return;
    w = window.innerWidth; h = window.innerHeight; fitTables();
  });
}
