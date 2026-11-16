// Print presets, « Gabarits » (owner, 2026-11-16, after OCAD's canvases): a course's print settings kept under a name — the
// paper, its orientation and margins, the area printed (around the course, or a drawn frame), the print scale, what the map
// leaves out (a training map: contours only, no paths…) and the background printed under it (OpenStreetMap, an aerial photo) —
// and put back on the course in hand or on every course in one click. Kept with the event (ev.canvases), so the whole team
// prints alike. A preset changes nothing by itself: it is applied, then each course can still be adjusted (« Zone d'impression »).

import * as M from "./model.js";
import { modal } from "./dialogs.js";
import { PAGES, pageOf } from "./pdf.js";
import { svg } from "./icons.js";
import { t, tn, locale } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nf = (v) => new Intl.NumberFormat(locale()).format(v);
const copy = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

/** A course's print settings (course 0: « Tous les postes »), as a preset holds them. */
export function capture(ev, courseId) {
  const c = courseId ? ev.courses[courseId] : null;
  return { area: copy(c ? c.printArea : ev.printArea) || M.DEFAULT_PRINT_AREA(), printScale: c ? c.printScale : ev.allControls.printScale,
    mapHide: c ? copy(c.mapHide || null) : (ev.mapHidden?.length || ev.mapHiddenSyms?.length ? { colors: copy(ev.mapHidden || []), symbols: copy(ev.mapHiddenSyms || []) } : null),
    bg: M.printBgOf(ev, courseId) };
}
/** A preset put on a course (or on « Tous les postes »), inside a change. */
export function apply(ev, preset, courseId) {
  const c = courseId ? ev.courses[courseId] : null;
  if (c) {
    c.printArea = copy(preset.area); c.partAreas = {}; c.printScale = preset.printScale;
    if (preset.mapHide) c.mapHide = copy(preset.mapHide); else delete c.mapHide;
    c.printBg = preset.bg || "";
  } else {
    ev.printArea = copy(preset.area); ev.allControls.printScale = preset.printScale;
    ev.mapHidden = copy(preset.mapHide?.colors || []); ev.mapHiddenSyms = copy(preset.mapHide?.symbols || []);
    if (!ev.mapHidden.length) delete ev.mapHidden; if (!ev.mapHiddenSyms.length) delete ev.mapHiddenSyms;
    ev.printBg = preset.bg || "";
  }
}
/** A preset in words: « A4 paysage · 1:10 000 · zone tracée · carte filtrée · OpenStreetMap ». */
export function summary(p) {
  const page = pageOf(p.area), name = Object.entries(PAGES).find(([, [w, h]]) => Math.abs(w - Math.min(page.w, page.h)) < 1 && Math.abs(h - Math.max(page.w, page.h)) < 1)?.[0] || `${Math.round(page.w)} × ${Math.round(page.h)} mm`;
  const orient = p.area.auto && !p.area.restrictOrientation ? t("trc.cv.orientAuto") : p.area.landscape ? t("trc.cv.landscape") : t("trc.cv.portrait");
  return [`${name} ${orient}`, `1:${nf(p.printScale)}`, p.area.auto || !p.area.rect ? t("trc.cv.areaAuto") : t("trc.cv.areaDrawn"),
    p.mapHide && (p.mapHide.colors?.length || p.mapHide.symbols?.length) ? t("trc.cv.filtered") : "", p.bg ? t(`trc.bg.l.${p.bg}`) : ""].filter(Boolean).join(" · ");
}

/** « Gabarits »: the event's presets — save the settings of the course in hand under a name, apply one to it or to every course. */
export async function canvasesDialog(E) {
  const ro = E.readOnly;
  const cur = () => (E.cd.course ? E.ev.courses[E.cd.course].name : t("trc.cv.allControls"));
  const list = () => E.ev.canvases || [];
  const rows = () => (list().length ? `<table class="tr-table tr-cv"><thead><tr><th>${esc(t("trc.cv.thName"))}</th><th>${esc(t("trc.cv.thWhat"))}</th><th></th></tr></thead><tbody>
    ${list().map((p) => `<tr data-id="${p.id}"><td><b>${esc(p.name)}</b></td><td>${esc(summary(p))}</td>
      <td class="tr-cv-acts"><button type="button" class="btn btn-sm btn-primary" data-a="all" ${ro ? "disabled" : ""}>${esc(t("trc.cv.applyAll"))}</button>
        <button type="button" class="btn btn-sm" data-a="one" ${ro ? "disabled" : ""}>${esc(t("trc.cv.applyOne", { name: cur() }))}</button>
        <button type="button" class="tr-icon" data-a="update" title="${esc(t("trc.cv.update", { name: cur() }))}" ${ro ? "disabled" : ""}>${svg("save", 15)}</button>
        <button type="button" class="tr-icon" data-a="del" title="${esc(t("trc.cv.delete"))}" ${ro ? "disabled" : ""}>${svg("trash", 15)}</button></td></tr>`).join("")}</tbody></table>`
    : `<p class="tr-hint">${esc(t("trc.cv.none"))}</p>`);
  await modal(E, { title: t("trc.cv.title"), wide: true, ok: null, cancel: t("trc.cv.close"), body: `
    <p>${esc(t("trc.cv.intro"))}</p>
    <div id="tr-cv-list">${rows()}</div>
    <div class="tr-cv-new"><label class="tr-field"><span>${esc(t("trc.cv.saveAs", { name: cur() }))}</span><input name="name" maxlength="60" placeholder="${esc(t("trc.cv.namePh"))}" ${ro ? "disabled" : ""}></label>
      <button type="button" class="btn" data-save ${ro ? "disabled" : ""}>${esc(t("trc.cv.save"))}</button></div>
    <p class="tr-hint">${esc(t("trc.cv.now", { name: cur(), what: summary(capture(E.ev, E.cd.course || 0)) }))}</p>`,
  onOpen: (f) => {
    const box = f.querySelector("#tr-cv-list"), redraw = () => { box.innerHTML = rows(); };
    f.querySelector("[data-save]").addEventListener("click", () => {
      const name = f.elements.name.value.trim();
      if (!name) { f.elements.name.focus(); return; }
      E.change((x) => {
        x.canvases = x.canvases || [];
        const old = x.canvases.find((p) => p.name.toLowerCase() === name.toLowerCase()), p = capture(x, E.cd.course || 0);
        if (old) Object.assign(old, p); else x.canvases.push({ id: Math.max(0, ...x.canvases.map((q) => q.id)) + 1, name, ...p });
      }, t("trc.cv.undoSave"));
      f.elements.name.value = ""; redraw();
    });
    f.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target === f.elements.name) { e.preventDefault(); f.querySelector("[data-save]").click(); } });
    box.addEventListener("click", (e) => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      const id = Number(b.closest("tr").dataset.id), p = list().find((q) => q.id === id);
      if (!p) return;
      if (b.dataset.a === "del") E.change((x) => { x.canvases = x.canvases.filter((q) => q.id !== id); if (!x.canvases.length) delete x.canvases; }, t("trc.cv.undoDelete"));
      else if (b.dataset.a === "update") { E.change((x) => Object.assign(x.canvases.find((q) => q.id === id), capture(x, E.cd.course || 0)), t("trc.cv.undoSave")); E.toast(t("trc.cv.updated", { name: p.name })); }
      else if (b.dataset.a === "one") { E.change((x) => apply(x, p, E.cd.course || 0), t("trc.cv.undoApply")); E.toast(t("trc.cv.appliedOne", { preset: p.name, name: cur() })); }
      else if (b.dataset.a === "all") { const ids = M.courseIds(E.ev); E.change((x) => { for (const c of ids) apply(x, p, c); apply(x, p, 0); }, t("trc.cv.undoApply")); E.toast(tn("trc.cv.appliedAll", ids.length, { preset: p.name })); }
      redraw(); E.syncMap?.(); E.opts.printArea = true; E.redraw();
    });
  } });
}
