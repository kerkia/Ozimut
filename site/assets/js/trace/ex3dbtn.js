// The relief's exaggeration on the 3D view itself (owner, 2026-11-15: « a button that appears when in 3D to adjust »): a button
// under « 3D » in the map's tools, shown only while the 3D view is on, saying the exaggeration (« ×1,5 »); a tap opens a small
// box beside it — − , a slider from × 1 to × 3 by quarters, + — that stretches the relief live. The same value as the setting
// under « Affichage » (the page's prefs `ex3d`): each moves the other. « Analyse solo » and the map analysis; the Tracer has
// its own slider in its 3D bar.

import { html, raw } from "../util.js";
import { t, locale } from "../i18n.js";

export const EX_MIN = 1, EX_MAX = 3, EX_STEP = 0.25;
const clamp = (k) => Math.min(EX_MAX, Math.max(EX_MIN, Math.round(k / EX_STEP) * EX_STEP));
export const exLabel = (k) => `×${Number(k).toLocaleString(locale(), { maximumFractionDigits: 2 })}`;
/** A vertical stretch: two arrows apart over a hill. */
export const EX_ICON = `<svg class="ico" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1.5 14.5 6 8l2.5 3 2-2.5 4 6"/><path d="M12.5 1.5v5M10.8 3.2l1.7-1.7 1.7 1.7"/></svg>`;

/** The button and its box, to put right after the « 3D » button (`id` its prefix: "an", "sh"). Hidden until `show(true)`. */
export const exHtml = (id) => html`<span class="an-ex3d" id="${id}-ex3d" hidden><button type="button" class="btn btn-sm an-ex3d-btn" aria-expanded="false"
    title="${t("an.v3.exBtn")}" aria-label="${t("an.v3.exBtn")}">${raw(EX_ICON)}<b></b></button><span class="an-ex3d-pop" role="group" aria-label="${t("an.v3.ex")}" hidden>
    <span class="an-ex3d-h">${t("an.v3.ex")}</span><span class="an-ex3d-row"><button type="button" class="btn btn-sm" data-ex="-" title="${t("an.v3.exLess")}" aria-label="${t("an.v3.exLess")}">−</button>
    <input type="range" min="${EX_MIN}" max="${EX_MAX}" step="${EX_STEP}" aria-label="${t("an.v3.ex")}"><b class="an-ex3d-v"></b>
    <button type="button" class="btn btn-sm" data-ex="+" title="${t("an.v3.exMore")}" aria-label="${t("an.v3.exMore")}">+</button></span></span></span>`;

/**
 * Binds the control in `root` (the element `exHtml` made). o: { get() → the exaggeration, set(k) (applies and keeps it) }.
 * Returns { sync() (the value changed elsewhere), show(on), close() }.
 */
export function bindEx(root, o) {
  if (!root) return { sync() {}, show() {}, close() {} };
  const btn = root.querySelector(".an-ex3d-btn"), pop = root.querySelector(".an-ex3d-pop"), range = pop.querySelector("input");
  const sync = () => {
    const k = o.get();
    btn.querySelector("b").textContent = exLabel(k);
    pop.querySelector(".an-ex3d-v").textContent = exLabel(k);
    if (Number(range.value) !== k) range.value = String(k);
    pop.querySelector('[data-ex="-"]').disabled = k <= EX_MIN;
    pop.querySelector('[data-ex="+"]').disabled = k >= EX_MAX;
  };
  const put = (k) => { k = clamp(k); if (k !== o.get()) o.set(k); sync(); };
  const outside = (e) => { if (!root.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); btn.focus(); } };
  function open() {
    pop.hidden = false; btn.setAttribute("aria-expanded", "true"); sync();
    document.addEventListener("pointerdown", outside, true);
    root.addEventListener("keydown", onKey);
  }
  function close() {
    if (pop.hidden) return;
    pop.hidden = true; btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside, true);
    root.removeEventListener("keydown", onKey);
  }
  btn.addEventListener("click", () => (pop.hidden ? open() : close()));
  range.addEventListener("input", () => put(Number(range.value)));
  pop.querySelectorAll("[data-ex]").forEach((b) => b.addEventListener("click", () => put(o.get() + (b.dataset.ex === "+" ? EX_STEP : -EX_STEP))));
  // the map's own gestures (drag, wheel) never start from the box
  for (const ev of ["pointerdown", "wheel", "dblclick"]) pop.addEventListener(ev, (e) => e.stopPropagation());
  sync();
  return { sync, close, show(on) { root.hidden = !on; if (!on) close(); else sync(); } };
}
