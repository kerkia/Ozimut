// What of an OCAD or Mapper map is shown (the advanced level; owner, 2026-10-24, after Condes's Canvas menu): its colours and
// symbols, any of them left out of the screen and the prints — for every course (ev.mapHidden: colour numbers, ev.mapHiddenSyms:
// symbol ids) or one course's training map (course.mapHide; owner, 2026-11-05) —, the corridor and windows of a training course
// (exercise.js), and an OCAD map's templates — the other files
// it shows under its drawing (a scan, an older map: vmap/ocad.js map.templates), which a browser cannot open by their path: the
// user gives them, and they are kept with the event as its other maps (maps.js, ev.maps[id].template), drawn half transparent
// over the map, placed where OCAD places them.

import * as M from "./model.js";
import * as S from "./store.js";
import { openMap, mimeOf } from "./mapsrc.js";
import { mapColors } from "./appear.js";
import { t } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** A map's symbols worth a choice (those it uses; its layout and images apart): [{ id, n (its number), name, kind }], in order. */
export function mapSymbols(map) {
  if (map?.kind !== "vector") return [];
  const out = [];
  for (const d of map.vmap.symdefs) {
    if (d.kind === "image" || !d.symbols.length || d.id == null || d.id === "") continue;
    const n = Math.floor(parseFloat(d.id));
    out.push({ id: String(d.id), n: Number.isFinite(n) ? n : null, name: d.name || "", kind: d.kind });
  }
  return out.sort((a, b) => (a.n ?? 1e9) - (b.n ?? 1e9) || String(a.id).localeCompare(String(b.id), "en", { numeric: true }));
}
// the symbols' families by their hundreds (ISOM, ISSprOM): relief, rock, water, vegetation, man-made features, technical, course
const FAMILIES = [1, 2, 3, 4, 5, 6, 7];
const familyOf = (sym) => (sym.n != null && sym.n >= 100 && sym.n < 800 ? Math.floor(sym.n / 100) : 0);
// the training maps' ready-made choices (owner, 2026-11-05), shared with Pixel's map options
export { presetSymbols, PRESETS } from "./vmap/presets.js";
import { presetSymbols, PRESETS } from "./vmap/presets.js";

/**
 * « Filtrer la carte » (the advanced level; owner, 2026-11-05: training maps): the colours and symbols of an OCAD or Mapper map
 * shown, for all the courses or for one of them (course.mapHide, model.mapHideFor), on screen, in the PDFs and the images. Ready-made
 * choices: the whole map, no paths, no vegetation, relief only, contours only.
 */
export async function colorsDialog(E) {
  const cols = mapColors(E.map), syms = mapSymbols(E.map);
  if (!cols.length) { E.toast(t("trc.mv.notVector")); return; }
  const { modal } = await import("./dialogs.js");
  const ev = E.ev, ids = M.courseIds(ev);
  // each scope's choice: 0 = every course (the event's), else a course (inherit: it follows the event's)
  const state = new Map();
  const stateOf = (k) => {
    if (!state.has(k)) {
      const own = k ? ev.courses[k]?.mapHide : null, h = M.mapHideFor(ev, k);
      state.set(k, { inherit: !!k && !own, colors: new Set(h.colors), syms: new Set(h.symbols) });
    }
    return state.get(k);
  };
  let scope = E.cd.course || 0;
  const groups = [...FAMILIES, 0].map((f) => [f, syms.filter((x) => familyOf(x) === f)]).filter(([, l]) => l.length);
  const body = `<p>${esc(t("trc.mv.filterIntro"))}</p>
    <label class="tr-field"><span>${esc(t("trc.mv.scope"))}</span><select id="tr-mf-scope">
      <option value="0">${esc(t("trc.mv.scopeAll"))}</option>
      ${ids.map((id) => `<option value="${id}">${esc(ev.courses[id].name || t("trc.ed.course"))}${ev.courses[id].mapHide ? " •" : ""}</option>`).join("")}</select></label>
    <label class="tr-check" id="tr-mf-inh-row"><input type="checkbox" id="tr-mf-inherit"> ${esc(t("trc.mv.inherit"))}</label>
    <div class="tr-mf-body">
      <p class="tr-mf-presets">${PRESETS.map((p) => `<button type="button" class="btn btn-sm" data-preset="${p}" title="${esc(t(`trc.mv.preset.${p}Tip`))}">${esc(t(`trc.mv.preset.${p}`))}</button>`).join(" ")}</p>
      <h3>${esc(t("trc.mv.colours"))}</h3>
      <div class="tr-checks tr-cols">${cols.map(([id, name]) => `<label class="tr-check"><input type="checkbox" data-col="${id}"> ${esc(name)}</label>`).join("")}</div>
      ${syms.length ? `<h3>${esc(t("trc.mv.symbols"))}</h3><div class="tr-mf-syms">${groups.map(([f, list]) => `<div class="tr-mf-fam">
        <label class="tr-check tr-mf-famhead"><input type="checkbox" data-fam="${f}"> <b>${esc(f ? `${f}xx · ${t(`trc.mv.fam${f}`)}` : t("trc.mv.fam0"))}</b></label>
        <div class="tr-checks">${list.map((x) => `<label class="tr-check"><input type="checkbox" data-sym="${esc(x.id)}" data-f="${f}"> ${esc(x.id)} ${esc(x.name)}</label>`).join("")}</div></div>`).join("")}</div>` : ""}
    </div>`;
  const v = await modal(E, { title: t("trc.mv.filterTitle"), wide: true, ok: t("trc.mv.apply"), body, onOpen: (f) => {
    const sel = f.querySelector("#tr-mf-scope"), inh = f.querySelector("#tr-mf-inherit"), inhRow = f.querySelector("#tr-mf-inh-row");
    const lists = f.querySelector(".tr-mf-body");
    sel.value = String(scope);
    const famBoxes = () => f.querySelectorAll("[data-fam]").forEach((b) => {
      const all = [...f.querySelectorAll(`[data-sym][data-f="${b.dataset.fam}"]`)], on = all.filter((x) => x.checked).length;
      b.checked = on === all.length; b.indeterminate = on > 0 && on < all.length;
    });
    const show = () => {
      const st = stateOf(scope);
      inhRow.hidden = !scope; inh.checked = st.inherit;
      const shown = st.inherit ? stateOf(0) : st;
      f.querySelectorAll("[data-col]").forEach((b) => { b.checked = !shown.colors.has(Number(b.dataset.col)); });
      f.querySelectorAll("[data-sym]").forEach((b) => { b.checked = !shown.syms.has(b.dataset.sym); });
      famBoxes();
      lists.classList.toggle("tr-off", st.inherit);
      lists.querySelectorAll("input, button").forEach((x) => { x.disabled = st.inherit; });
    };
    // a change of the lists: this scope's own choice from now on
    const read = () => {
      const st = stateOf(scope);
      st.colors = new Set([...f.querySelectorAll("[data-col]")].filter((b) => !b.checked).map((b) => Number(b.dataset.col)));
      st.syms = new Set([...f.querySelectorAll("[data-sym]")].filter((b) => !b.checked).map((b) => b.dataset.sym));
      st.edited = true;
      famBoxes();
    };
    sel.addEventListener("change", () => { scope = Number(sel.value) || 0; show(); });
    inh.addEventListener("change", () => {
      const st = stateOf(scope); st.inherit = inh.checked; st.edited = true;
      if (!st.inherit) { const base = stateOf(0); st.colors = new Set(base.colors); st.syms = new Set(base.syms); }
      show();
    });
    f.querySelectorAll("[data-col], [data-sym]").forEach((b) => b.addEventListener("change", read));
    f.querySelectorAll("[data-fam]").forEach((b) => b.addEventListener("change", () => {
      f.querySelectorAll(`[data-sym][data-f="${b.dataset.fam}"]`).forEach((x) => { x.checked = b.checked; });
      read();
    }));
    f.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
      const p = b.dataset.preset;
      if (p === "full") { f.querySelectorAll("[data-col], [data-sym]").forEach((x) => { x.checked = true; }); read(); return; }
      const hide = new Set(presetSymbols(syms, p));
      f.querySelectorAll("[data-sym]").forEach((x) => { if (hide.has(x.dataset.sym)) x.checked = false; });
      read();
    }));
    show();
  } });
  if (!v) return;
  E.status(t("trc.mv.redraw"), "busy");
  E.change((x) => {
    for (const [k, st] of state) {
      if (!st.edited) continue;
      if (!k) {
        if (st.colors.size) x.mapHidden = [...st.colors]; else delete x.mapHidden;
        if (st.syms.size) x.mapHiddenSyms = [...st.syms]; else delete x.mapHiddenSyms;
      } else if (x.courses[k]) {
        if (st.inherit) delete x.courses[k].mapHide;
        else x.courses[k].mapHide = { colors: [...st.colors], symbols: [...st.syms] };
      }
    }
  }, t("trc.mv.colorsUndo"));
  await E.syncMap?.();
  E.status(t("trc.mv.done"), "ok");
}

/**
 * « Exercices » (owner, 2026-11-05: corridor and windows; 2026-11-16: the other generators, after OCAD's training recipes — one
 * command per exercise, from the course in hand). The map of the course:
 * - corridor: hidden but along its legs (a width), with windows round its controls if wished;
 * - windows: hidden but round its controls (a radius);
 * - controls hidden: a white patch round each control (the last metres without the map);
 * - legs hidden: a white band over the middle of each leg (a share of its length);
 * each a mask that follows the course (exercise.js) and shows on that course only; and
 * - a map per leg: a map exchange at every control, so that each leg prints on a page of its own (and none again to undo it);
 * - puzzle: the course's image cut into squares, shuffled (and turned if wished), to print — an image, not a change of the course.
 * Contours only, no paths, no vegetation: « Filtrer la carte ».
 */
export async function exerciseDialog(E) {
  const course = E.cd.course;
  if (!course) { E.toast(t("trc.rib.whyCourse")); return; }
  const X = await import("./exercise.js");
  const { modal, field, num } = await import("./dialogs.js");
  const { where } = await import("./ribbon-data.js");
  const ev = E.ev, cur = X.exerciseOf(ev, course)?.gen;
  const sprint = (ev.map.scale || 10000) <= 5000, score = M.isScore(ev, course);
  const ccs = M.ccIds(ev, M.cdCourse(course)).filter((id) => ev.controls[ev.courseControls[id].control]?.kind === "normal");
  const perLeg = ccs.length > 1 && ccs.every((id) => ev.courseControls[id].exchange);
  const now = perLeg ? "perleg" : !cur ? (score ? "windows" : "corridor") : cur.mode === "hide" ? (cur.width > 0 ? "hidelegs" : "hidectl") : cur.width > 0 ? "corridor" : "windows";
  const W = cur?.width > 0 ? cur.width : sprint ? 30 : 80, R = cur?.window > 0 ? cur.window : sprint ? 25 : 60, share = Math.round(100 * (cur?.share || 0.5));
  const opt = (k, extra = "") => `<label class="tr-ex-opt"><input type="radio" name="k" value="${k}" ${now === k ? "checked" : ""} ${score && ["corridor", "hidelegs", "perleg"].includes(k) ? "disabled" : ""}>
    <span><b>${esc(t(`trc.mv.ex.${k}`))}</b><small>${esc(t(`trc.mv.ex.${k}Tip`))}</small>${extra}</span></label>`;
  const num1 = (name, val, unit, label) => `<span class="tr-ex-num"><label>${esc(label)} <input name="${name}" value="${val}" size="4" inputmode="decimal" data-fresh> ${unit}</label></span>`;
  const v = await modal(E, { title: t("trc.mv.exTitle2", { course: ev.courses[course].name || "" }), wide: true, ok: t("trc.mv.apply"),
    extra: cur || perLeg ? `<button type="submit" class="btn" data-v="remove">${esc(t("trc.mv.exRemove2"))}</button>` : "",
    body: `<div class="tr-ex-list">
      ${opt("corridor", `${num1("w1", W, "m", t("trc.mv.exWidthShort"))}${num1("r1", cur && now === "corridor" ? cur.window : 0, "m", t("trc.mv.exWindowShort"))}`)}
      ${opt("windows", num1("r2", R, "m", t("trc.mv.exWindowShort")))}
      ${opt("hidectl", num1("r3", R, "m", t("trc.mv.exPatch")))}
      ${opt("hidelegs", `${num1("w4", W, "m", t("trc.mv.exWidthShort"))}${num1("s4", share, "%", t("trc.mv.exShare"))}`)}
      ${opt("perleg")}
      ${opt("puzzle", `${num1("pc", 4, "×", t("trc.mv.exCols"))}${num1("pr", 3, "", t("trc.mv.exRows"))}<label class="tr-check"><input type="checkbox" name="pt" data-fresh> ${esc(t("trc.mv.exTurn"))}</label>`)}
    </div>
    <p class="tr-hint">${esc(t("trc.mv.exFollow2", { where: where("map-colors") }))}</p>`,
    validate: (x) => {
      if (x._submit === "remove") return null;
      const bad = (n) => !(num(n) > 0);
      if (x.k === "corridor" && bad(x.w1)) return t("trc.mv.exNeed");
      if (x.k === "windows" && bad(x.r2)) return t("trc.mv.exNeed");
      if (x.k === "hidectl" && bad(x.r3)) return t("trc.mv.exNeed");
      if (x.k === "hidelegs" && (bad(x.w4) || !(num(x.s4) >= 10 && num(x.s4) <= 90))) return t("trc.mv.exNeedShare");
      if (x.k === "puzzle" && !(num(x.pc) >= 2 && num(x.pc) <= 12 && num(x.pr) >= 2 && num(x.pr) <= 12)) return t("trc.mv.exNeedGrid");
      return null;
    } });
  if (!v) return;
  const setAll = (x, on) => { for (const id of ccs) { const cc = x.courseControls[id]; if (on) cc.exchange = true; else { delete cc.exchange; delete cc.flip; } } };
  if (v._submit === "remove") { E.change((x) => { X.clearExercise(x, course); if (perLeg) setAll(x, false); }, t("trc.mv.exRemoved2")); return; }
  const cap = (n) => Math.max(0, Math.min(2000, num(n) || 0));
  if (v.k === "puzzle") return puzzle(E, Math.round(num(v.pc)), Math.round(num(v.pr)), !!v.pt);
  if (v.k === "perleg") { E.change((x) => { X.clearExercise(x, course); setAll(x, true); }, t("trc.mv.ex.perleg")); E.toast(t("trc.mv.exPerLegDone", { n: ccs.length + 1 }), 7000); return; }
  const gen = v.k === "corridor" ? { course, width: cap(v.w1), window: cap(v.r1), keep: X.logosOf(E.map) }
    : v.k === "windows" ? { course, width: 0, window: cap(v.r2), keep: X.logosOf(E.map) }
      : v.k === "hidectl" ? { course, mode: "hide", width: 0, window: cap(v.r3), keep: [] }
        : { course, mode: "hide", width: cap(v.w4), window: 0, share: Math.max(0.1, Math.min(0.9, num(v.s4) / 100)), keep: [] };
  E.status(t("trc.mv.exBusy"), "busy");
  E.change((x) => { X.clearExercise(x, course); if (perLeg) setAll(x, false); X.setExercise(x, gen); }, t(`trc.mv.ex.${v.k}`));
  E.status(t("trc.mv.done"), "ok");
}
/** The puzzle: the course's image (its print area, 200 dpi) cut into cols × rows squares, shuffled — each turned by a quarter
 *  turn or more when asked, where the squares allow it —, saved as a PNG to print at the course's scale. */
async function puzzle(E, cols, rows, turn) {
  const { courseImage } = await import("./exports.js"), { download, fileName, lentStop } = await import("./dialogs.js");
  if (lentStop(E)) return;
  E.status(t("trc.mv.exBusy"), "busy");
  try {
    const { canvas } = await courseImage(E, E.cdDraw || E.cd, 200, { withMap: true });
    const tw = Math.floor(canvas.width / cols), th = Math.floor(canvas.height / rows), square = Math.abs(tw - th) < 2, gap = Math.max(2, Math.round(tw / 60));
    const out = document.createElement("canvas"); out.width = cols * tw + (cols + 1) * gap; out.height = rows * th + (rows + 1) * gap;
    const g = out.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, out.width, out.height);
    const order = Array.from({ length: cols * rows }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    order.forEach((src, dst) => {
      const sx = (src % cols) * tw, sy = Math.floor(src / cols) * th, dx = gap + (dst % cols) * (tw + gap), dy = gap + Math.floor(dst / cols) * (th + gap);
      const q = turn ? (square ? Math.floor(Math.random() * 4) : 2 * Math.floor(Math.random() * 2)) : 0;
      g.save(); g.translate(dx + tw / 2, dy + th / 2); g.rotate((q * Math.PI) / 2);
      g.drawImage(canvas, sx, sy, tw, th, -tw / 2, -th / 2, tw, th);
      g.restore();
    });
    const blob = await new Promise((ok) => out.toBlob(ok, "image/png"));
    download(`${fileName(E.ev.title)} - ${fileName(E.ev.courses[E.cd.course]?.name || "")} - ${t("trc.mv.ex.puzzle")}.png`, blob, "image/png");
    E.status(t("trc.mv.done"), "ok");
  } catch (err) { console.error(err); E.status(t("trc.mv.exFailed"), "bad"); E.toast(err.message || String(err)); }
}

/** The affine from the event's mm to a template image's sheet mm (its pixels at u × v mm, OCAD's placing: its centre at (x, y) of
 *  the map file's mm, turned by its angle). */
function templateTf(ev, tp, pxW, pxH) {
  const w = pxW * tp.u, h = pxH * tp.v, a = (tp.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), [ox, oy] = M.fileOffset(ev);
  // sheet (sx, sy) → file: centre + R·(sx − w/2, sy − h/2) → event: file − origin; the inverse is the event → sheet
  const fwd = [c, -s, tp.x - ox - c * w / 2 + s * h / 2, s, c, tp.y - oy - s * w / 2 - c * h / 2];
  const det = fwd[0] * fwd[4] - fwd[1] * fwd[3];
  return [fwd[4] / det, -fwd[1] / det, (fwd[1] * fwd[5] - fwd[4] * fwd[2]) / det, -fwd[3] / det, fwd[0] / det, (fwd[3] * fwd[2] - fwd[0] * fwd[5]) / det];
}
/** « Modèles de la carte »: the OCAD map's templates listed, their files dropped here, shown over the map or not. */
export async function templatesDialog(E) {
  const list = E.map?.vmap?.templates || [];
  const { modal, dropHtml, dropZone } = await import("./dialogs.js");
  const kept = Object.entries(E.ev.maps || {}).filter(([, m]) => m.template);
  const given = new Map();
  const base = (p) => String(p || "").split(/[\\/]/).pop().toLowerCase();
  const v = await modal(E, { title: t("trc.mv.tplTitle"), wide: true, ok: t("trc.mv.apply"), body: `<p>${esc(list.length ? t("trc.mv.tplIntro") : t("trc.mv.tplNone"))}</p>
    ${list.length ? `<table class="tr-table"><thead><tr><th>${esc(t("trc.mv.tplFile"))}</th><th>${esc(t("trc.mv.tplState"))}</th></tr></thead><tbody>
      ${list.map((tp, i) => { const k = kept.find(([, m]) => base(m.map.file) === base(tp.file)); return `<tr><td>${esc(base(tp.file))}</td><td id="tr-tpl-${i}">${k ? `<label class="tr-check"><input type="checkbox" name="s${k[0]}" ${E.ev.maps[k[0]].hidden ? "" : "checked"}> ${esc(t("trc.mv.tplShown"))}</label>` : esc(t("trc.mv.tplMissing"))}</td></tr>`; }).join("")}</tbody></table>
      ${dropHtml("tr-tpl-drop", t("trc.mv.tplDrop"), "image/*,.tif,.tiff,.bmp,.jpg,.png", true)}` : ""}`,
  onOpen: (f) => { const z = f.querySelector("#tr-tpl-drop"); if (z) dropZone(z, (files) => { for (const fl of files) { const i = list.findIndex((tp) => base(tp.file) === fl.name.toLowerCase()); if (i >= 0) { given.set(i, fl); f.querySelector(`#tr-tpl-${i}`).textContent = t("trc.mv.tplGiven"); } else E.toast(t("trc.mv.tplNotListed", { name: fl.name })); } }); } });
  if (!v) return;
  const added = [];
  for (const [i, fl] of given) {
    const tp = list[i], bytes = new Uint8Array(await fl.arrayBuffer()), type = mimeOf(fl.name, fl.type);
    let src;
    try { src = await openMap(bytes, type, fl.name); } catch (e) { E.toast(t("trc.mv.tplUnreadable", { name: fl.name })); continue; }
    const id = Math.max(0, ...Object.keys(E.ev.maps || {}).map(Number), ...added.map((a) => a.id)) + 1;
    await S.saveExtraMap(E.meta.id, id, bytes, type, E.key);
    E.extraMaps = { ...(E.extraMaps || {}), [id]: src };
    added.push({ id, entry: { name: fl.name, template: true, map: { kind: "bitmap", file: fl.name, scale: E.ev.map.scale, dpi: 0, w: src.pxW * tp.u, h: src.pxH * tp.v }, tf: templateTf(E.ev, tp, src.pxW, src.pxH) } });
  }
  E.change((x) => {
    x.maps = x.maps || {};
    for (const a of added) x.maps[a.id] = a.entry;
    for (const [id] of kept) if (x.maps[id]) { if (v[`s${id}`]) delete x.maps[id].hidden; else x.maps[id].hidden = true; }
    if (!Object.keys(x.maps).length) delete x.maps;
  }, t("trc.mv.tplUndo"));
}
