// « Premiers pas » (owner, 2026-11-17: the review of the Tracer's workflows — a new event opened on an empty editor, with the
// tool's help in one small line at the window's bottom and nothing saying what comes first): a short list in the left pane,
// while the event has no course with controls yet — place the start, controls and finish; make a course; click its controls
// in order; check and print — each step with the button that does it, ticked as it is done. It shows for an event opened
// incomplete, stays until its courses exist, and goes with « × » (for good when given up before the end: the reader knows
// the tool; for that event only once done).

import * as M from "./model.js";
import { svg } from "./icons.js";
import { t } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const OFF = "ocn.tr.steps", offKey = (E) => `ocn.tr.steps.${E.meta?.id || ""}`;
const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* this visit */ } };

/** Where the event stands: { start, finish, controls, courses, inCourse (normal controls in the course shown, or the fullest) }. */
export function progress(E) {
  const ev = E.ev, kinds = Object.values(ev.controls || {}).map((c) => c.kind);
  const ids = M.courseIds(ev), count = (id) => M.ccIds(ev, M.cdCourse(id)).filter((cc) => ev.controls[ev.courseControls[cc].control]?.kind === "normal").length;
  return { start: kinds.includes("start"), finish: kinds.includes("finish"), controls: kinds.filter((k) => k === "normal").length,
    courses: ids.length, inCourse: ids.length ? Math.max(...ids.map(count)) : 0, shown: E.cd.course || 0 };
}
const built = (p) => p.start && p.finish && p.controls > 0 && p.courses > 0 && p.inCourse > 0;

/** Draw the list above the left pane's details (called at every refresh). */
export function render(E) {
  const info = E.$("#tr-info");
  if (!info) return;
  let box = E.$("#tr-steps");
  const p = E.blank || E.readOnly ? null : progress(E);
  // decided once per opening: an event that comes complete (an import, an event of before) never shows it
  if (E.stepsOn == null) E.stepsOn = !!p && !built(p) && get(OFF) !== "off" && get(offKey(E)) !== "off";
  if (!p || !E.stepsOn) { box?.remove(); return; }
  if (!box) { box = document.createElement("div"); box.id = "tr-steps"; box.className = "tr-steps"; info.parentNode.insertBefore(box, info); bind(E, box); }
  const done = built(p), tick = (ok) => `<span class="tr-step-n${ok ? " ok" : ""}">${ok ? "✓" : ""}</span>`;
  const btn = (a, label, icon, primary = false, off = false) => `<button type="button" class="btn btn-sm${primary ? " btn-primary" : ""}" data-fs="${a}" ${off ? "disabled" : ""}>${icon ? svg(icon, 14) : ""} ${esc(label)}</button>`;
  const s1 = p.start && p.finish && p.controls > 0, s2 = p.courses > 0, s3 = p.inCourse > 0;
  const next = !s1 ? 1 : !s2 ? 2 : !s3 ? 3 : 4;
  box.innerHTML = `<div class="tr-steps-head"><b>${esc(t(done ? "trc.fs.doneTitle" : "trc.fs.title"))}</b><button type="button" class="tr-icon" data-fs="close" title="${esc(t("trc.fs.close"))}" aria-label="${esc(t("trc.fs.close"))}">${svg("close", 14)}</button></div>
    <ol class="tr-steps-list">
      <li class="${s1 ? "done" : next === 1 ? "now" : ""}">${tick(s1)}<div><span>${esc(t("trc.fs.s1"))}</span>
        ${s1 ? "" : `<div class="tr-steps-btns">${btn("tool:start", t("trc.fs.start"), "start", !p.start, false)}${btn("tool:control", t("trc.fs.control", { n: p.controls }), "control", p.start && !p.controls)}${btn("tool:finish", t("trc.fs.finish"), "finish", p.start && p.controls > 0 && !p.finish)}</div>`}</div></li>
      <li class="${s2 ? "done" : next === 2 ? "now" : ""}">${tick(s2)}<div><span>${esc(t("trc.fs.s2"))}</span>
        ${s2 ? "" : `<div class="tr-steps-btns">${btn("course-new", t("trc.fs.newCourse"), "plus", next === 2)}</div>`}</div></li>
      <li class="${s3 ? "done" : next === 3 ? "now" : ""}">${tick(s3)}<div><span>${esc(t("trc.fs.s3"))}</span>
        ${s3 || !s2 ? "" : `<div class="tr-steps-btns">${btn("tool:control", t("trc.fs.addControls"), "control", next === 3, !p.shown)}</div><small>${esc(t(p.shown ? "trc.fs.s3Hint" : "trc.fs.s3Need"))}</small>`}</div></li>
      <li class="${next === 4 ? "now" : ""}">${tick(false)}<div><span>${esc(t("trc.fs.s4"))}</span>
        ${next === 4 ? `<div class="tr-steps-btns">${btn("rep-audit", t("trc.fs.check"), "shield")}${btn("pdf-courses", t("trc.fs.print"), "printer", true)}</div>` : ""}</div></li>
    </ol>`;
}
function bind(E, box) {
  box.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-fs]");
    if (!b) return;
    const a = b.dataset.fs, p = progress(E);
    if (a === "close") { set(built(p) ? offKey(E) : OFF, "off"); E.stepsOn = false; box.remove(); return; }
    if (a.startsWith("tool:")) {
      // the tool, with its button in sight in the ribbon
      if (E.ribbon) { E.ribbon.tab = "home"; E.ribbon.prevTab = "home"; }
      E.setTool(a.slice(5)); E.ribbon?.update?.();
      E.canvas?.focus?.({ preventScroll: true });
      return;
    }
    if (a === "rep-audit" || a === "pdf-courses") { set(offKey(E), "off"); E.stepsOn = false; box.remove(); }
    (await import("./dialogs.js")).action(E, a);
  });
}
