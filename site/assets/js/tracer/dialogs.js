// The editor's menus and dialogs (tracer/editor.js): one entry, action(E, name), for every menu item, toolbar button and
// right-click choice; the dialogs (event and course properties, appearance, IOF standards, numbering, codes, punch
// patterns, competitor loads, team, versions, encryption, variations…) are small forms in a modal box. The outputs
// (PDF, files, reports) load their modules when first asked for.

import * as M from "./model.js";
import * as S from "./store.js";
import { symbol, symbolName, loadSymbols, languages } from "./symbols.js";
import { family, FAMILY_LABEL } from "./fonts.js";
import { readPpen, writePpen, ppenLosses } from "./ppen.js";
import { writeOcn, EXT as OCN_EXT } from "./ocnfile.js";
import { SPECIAL_NAME } from "./actions.js";
import * as A from "./actions.js";
import { mapPurple, mapColors, defaultLayer } from "./appear.js";
import { where, isPro } from "./ribbon-data.js";
import { actIcon, svg } from "./icons.js";
import { t, tn, lang, locale } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nf = (v) => new Intl.NumberFormat(locale()).format(v);

// ---- the modal box ---------------------------------------------------------------------------------------------------------
// remember: a dialog that comes back with the choices made last time on this browser (the exports' format, resolution,
// copies…; owner, 2026-10-17), kept in ocn.tr.prefs « dialogs ». The courses ticked (c<id>), files and passwords are not kept.
const PREFS = "ocn.tr.prefs";
const recall = (k) => { try { return JSON.parse(localStorage.getItem(PREFS) || "{}").dialogs?.[k] || null; } catch (e) { return null; } };
const keepChoices = (k, v) => { try { const o = JSON.parse(localStorage.getItem(PREFS) || "{}"); o.dialogs = { ...(o.dialogs || {}), [k]: v }; localStorage.setItem(PREFS, JSON.stringify(o)); } catch (e) { /* this visit */ } };
const kept = (el) => el.name && !/^c\d+$/.test(el.name) && !el.hasAttribute?.("data-fresh") && !["file", "password", "hidden", "submit", "button"].includes(el.type);
/** A modal form: returns a promise of the form's values (an object by input name) or null when cancelled. */
export function modal(E, { title, body, ok = "OK", cancel = t("trc.dlg.cancel"), wide = false, onOpen = null, validate = null, extra = "", remember = null }) {
  return new Promise((resolve) => {
    const m = document.createElement("div");
    m.className = "tr-modal";
    m.innerHTML = `<div class="tr-dialog ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <h2>${esc(title)}</h2><form class="tr-form" novalidate>${body}<p class="tr-err" hidden></p>
      <div class="tr-dlg-btns">${extra}${cancel ? `<button type="button" class="btn" data-x="cancel">${esc(cancel)}</button>` : ""}${ok ? `<button type="submit" class="btn btn-primary">${esc(ok)}</button>` : ""}</div></form></div>`;
    (E?.root || document.body).appendChild(m);
    const form = m.querySelector("form");
    const done = (v) => { m.remove(); resolve(v); };
    const values = () => {
      const o = {};
      for (const el of form.elements) {
        if (!el.name) continue;
        if (el.type === "checkbox") o[el.name] = el.checked;
        else if (el.type === "radio") { if (el.checked) o[el.name] = el.value; }
        else if (el.type === "file") o[el.name] = el.files;
        else if (el.multiple) o[el.name] = [...el.selectedOptions].map((x) => x.value);
        else o[el.name] = el.value;
      }
      return o;
    };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = values();
      v._submit = e.submitter?.dataset?.v || "";        // a dialog with two ways to accept (« Enregistrer » / « Publier »)
      const err = validate ? await validate(v, form) : null;
      if (err) { const p = form.querySelector(".tr-err"); p.textContent = err; p.hidden = false; return; }
      done(v);
    });
    m.querySelector('[data-x="cancel"]')?.addEventListener("click", () => done(null));
    m.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); done(null); } });
    m.addEventListener("pointerdown", (e) => { if (e.target === m) done(null); });
    // the last choices, put back before onOpen sees the form (a choice the form no longer offers is left as it is)
    const last = remember ? recall(remember) : null;
    if (last) for (const el of form.elements) {
      if (!kept(el) || !(el.name in last)) continue;
      const v = last[el.name];
      if (el.type === "checkbox") el.checked = !!v;
      else if (el.type === "radio") el.checked = el.value === v;
      else if (el.tagName === "SELECT") { if ([...el.options].some((o) => o.value === v)) el.value = v; }
      else if (typeof v === "string") el.value = v;
    }
    if (remember) form.addEventListener("submit", () => {
      const v = values(), o = {};
      for (const el of form.elements) if (kept(el) && el.name in v) o[el.name] = v[el.name];
      setTimeout(() => { if (!m.isConnected) keepChoices(remember, o); }, 0);       // kept once the dialog is accepted
    });
    onOpen?.(form, done);
    // a dialog with nothing to fill in and only « Fermer » still takes the keyboard (Échap must close it)
    (form.querySelector("input:not([type=hidden]), select, textarea") || form.querySelector("button[type=submit]") || m.querySelector('[data-x="cancel"]'))?.focus();
  });
}
/** A drop zone: files dropped on it, anywhere on its dialog, or picked by a click on it go to onFiles (a list of File). */
export const dropHtml = (id, text, accept = "", multiple = true) => `<div class="tr-drop" id="${id}" tabindex="0" role="button" aria-label="${esc(text)}">
  <input type="file" ${multiple ? "multiple" : ""} ${accept ? `accept="${accept}"` : ""} hidden><span class="tr-drop-ico" aria-hidden="true">⇩</span><span>${esc(text)}</span></div>`;
export function dropZone(zone, onFiles) {
  const input = zone.querySelector("input[type=file]"), host = zone.closest(".tr-modal") || zone;
  const take = (files) => { if (files?.length) onFiles([...files]); };
  zone.addEventListener("click", (e) => { if (e.target !== input) input.click(); });
  zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { take(input.files); input.value = ""; });
  host.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files")) { e.preventDefault(); zone.classList.add("over"); } });
  host.addEventListener("dragleave", (e) => { if (e.target === host || e.target === zone) zone.classList.remove("over"); });
  host.addEventListener("drop", (e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); zone.classList.remove("over"); take(e.dataTransfer.files); });
}
export const confirm = (E, text, okLabel, then) => modal(E, { title: t("trc.dlg.confirm"), body: `<p>${esc(text)}</p>`, ok: okLabel }).then((v) => { if (v) then(); });
const field = (label, input, hint = "") => `<label class="tr-field"><span>${esc(label)}</span>${input}${hint ? `<small>${esc(hint)}</small>` : ""}</label>`;
const sel = (name, opts, cur) => `<select name="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
const num = (v) => { const x = Number(String(v).replace(",", ".")); return Number.isFinite(x) ? x : NaN; };

/** A small menu at a screen point: items [action, label] or "-", each with its icon (icons.js). */
export function popupMenu(E, cx, cy, items, onPick) {
  const pop = document.createElement("div");
  pop.className = "tr-pop tr-ctx";
  // an item: [act, label, icon name (else the act's own)]
  pop.innerHTML = items.map((it) => (it === "-" ? "<hr>" : `<button type="button" data-a="${it[0]}">${it[2] ? svg(it[2], 16) : actIcon(it[0])}<span>${esc(it[1])}</span></button>`)).join("");
  E.root.appendChild(pop);
  const W = window.innerWidth, H = window.innerHeight;
  pop.style.left = `${Math.min(cx, W - pop.offsetWidth - 8)}px`; pop.style.top = `${Math.min(cy, H - pop.offsetHeight - 8)}px`;
  const close = () => { pop.remove(); document.removeEventListener("pointerdown", off, true); document.removeEventListener("keydown", key, true); };
  const off = (e) => { if (!pop.contains(e.target)) close(); };
  const key = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  setTimeout(() => document.addEventListener("pointerdown", off, true), 0);
  document.addEventListener("keydown", key, true);
  pop.querySelectorAll("[data-a]").forEach((b) => b.addEventListener("click", () => { close(); onPick(b.dataset.a); }));
}
// ---- « Fichier »'s dialogs (owner, 2026-11-07: the Tracer's « Fichier » page became a menu, as Cartographier's) --------------------
const normTxt = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const lastOf = (key) => { try { return localStorage.getItem(`ocn.tr.pick.${key}`) || null; } catch (e) { return null; } };
const keepLast = (key, act) => { try { localStorage.setItem(`ocn.tr.pick.${key}`, act); } catch (e) { /* this visit */ } };

/** A dialog of the « Fichier » menu: a title, a close button, its body (html), an optional search field that filters the cards
 *  (`[data-q]`: the text searched) and hides the groups left empty. onClick(event, api) gets every click in the body.
 *  → { el, body, close, set(html) }; onClose() when it closes, whatever closes it. */
export function fileDialog(E, { title, sub = "", body = "", search = false, onClick = null, onClose = null }) {
  const m = document.createElement("div");
  m.className = "tr-modal";
  m.innerHTML = `<div class="tr-dialog wide tr-fdlg" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="tr-fdlg-head"><h2>${esc(title)}</h2><button type="button" class="tr-start-x" data-fdlg-close title="${esc(t("trc.fdlg.closeEsc"))}" aria-label="${esc(t("trc.fdlg.close"))}">×</button></div>
    ${sub ? `<p class="tr-bs-sub">${esc(sub)}</p>` : ""}
    ${search ? `<input type="search" class="tr-fdlg-q" placeholder="${esc(t("trc.fdlg.search"))}" aria-label="${esc(t("trc.fdlg.search"))}">` : ""}
    <div class="tr-fdlg-body"></div><p class="tr-fdlg-none muted" hidden>${esc(t("trc.fdlg.none"))}</p></div>`;
  (E?.root || document.body).appendChild(m);
  const bodyEl = m.querySelector(".tr-fdlg-body"), q = m.querySelector(".tr-fdlg-q"), none = m.querySelector(".tr-fdlg-none");
  const api = { el: m, body: bodyEl, set: (h) => { bodyEl.innerHTML = h; filter(); }, close: () => { if (!m.isConnected) return; m.remove(); document.removeEventListener("keydown", onKey, true); onClose?.(); } };
  function filter() {
    if (!q) return;
    const words = normTxt(q.value.trim()).split(/\s+/).filter(Boolean);
    let shown = 0;
    bodyEl.querySelectorAll("[data-q]").forEach((c) => { const on = words.every((w) => normTxt(c.dataset.q).includes(w)); c.hidden = !on; if (on) shown++; });
    bodyEl.querySelectorAll(".tr-fdlg-group").forEach((g) => { g.hidden = !g.querySelector("[data-q]:not([hidden])"); });
    none.hidden = shown > 0;
  }
  const onKey = (e) => {
    if (e.key === "Escape" && m === [...document.querySelectorAll(".tr-modal")].pop()) { e.preventDefault(); e.stopPropagation(); api.close(); }
    if (e.key === "Enter" && e.target === q) { e.preventDefault(); bodyEl.querySelector("[data-q]:not([hidden])")?.click(); }
  };
  document.addEventListener("keydown", onKey, true);
  m.addEventListener("pointerdown", (e) => { if (e.target === m) api.close(); });
  m.querySelector("[data-fdlg-close]").addEventListener("click", () => api.close());
  bodyEl.addEventListener("click", (e) => onClick?.(e, api));
  q?.addEventListener("input", filter);
  api.set(body);
  (q || bodyEl.querySelector("button") || m.querySelector("[data-fdlg-close]")).focus({ preventScroll: true });
  return api;
}

/** One command among many, as cards — « Exporter… »'s formats, « Importer… »'s ways in: each card its icon, name, file extension
 *  and what it is for, grouped by purpose; a search over them when asked; the last one chosen (`last`, a key) shown first.
 *  groups: [{ title, items: [{ act, label, desc, ext, icon (a name, else the act's own) }] }] → the act chosen, or null. */
export function chooser(E, { title, sub = "", groups, last = null, search = false }) {
  return new Promise((resolve) => {
    let picked = null;
    const all = groups.flatMap((g) => g.items);
    const prev = last ? all.find((it) => it.act === lastOf(last)) : null;
    const card = (it) => `<button type="button" class="tr-bs-card" data-pick="${esc(it.act)}" data-q="${esc(`${it.label} ${it.desc || ""} ${it.ext || ""}`)}">${it.icon ? svg(it.icon, 22) : actIcon(it.act, 22)}
      <b>${esc(it.label)}${it.ext ? ` <span class="tr-ext">${esc(it.ext)}</span>` : ""}</b><span>${esc(it.desc || "")}</span></button>`;
    const group = (title, items) => (items.length ? `<section class="tr-fdlg-group">${title ? `<h4>${esc(title)}</h4>` : ""}<div class="tr-bs-cards">${items.map(card).join("")}</div></section>` : "");
    const body = (prev ? group(t("trc.fdlg.last"), [prev]) : "") + groups.map((g) => group(g.title, g.items)).join("");
    fileDialog(E, { title, sub, body, search, onClose: () => resolve(picked),
      onClick: (e, api) => { const b = e.target.closest("[data-pick]"); if (!b) return; picked = b.dataset.pick; if (last) keepLast(last, picked); api.close(); } });
  });
}

export function specialMenu(E, btn) {
  const r = btn.getBoundingClientRect();
  const groups = [[t("trc.dlg.grpPoints"), ["water", "first-aid", "optional-crossing-point", "forbidden-route", "registration-mark"]],
    [t("trc.dlg.grpLines"), ["boundary", "out-of-bounds", "dangerous-area", "temporary-construction", "white-out", "line"]], [t("trc.dlg.grpFrames"), ["text", "image", "rectangle", "ellipse", "qr"]],
    // the advanced level: MTB-O's symbols, enlarged map sections and masks
    ...(E.pro ? [[t("trc.dlg.grpMtbo"), ["mtbo-oneway", "mtbo-forbidden-route", "mtbo-danger", "mtbo-obstacle", "mtbo-forbidden-pass"]], [t("trc.dlg.grpLayout"), ["inset", "mask"]]] : [])];
  const items = [];
  for (const [, ks] of groups) { if (items.length) items.push("-"); for (const k of ks) items.push([k, SPECIAL_NAME[k]]); }
  popupMenu(E, r.left, r.bottom + 4, items, (k) => E.setTool(`special:${k}`));
}

// ---- actions -------------------------------------------------------------------------------------------------------------------
const lazy = { pdf: () => import("./pdf.js"), out: () => import("./exports.js"), rep: () => import("./reports.js"), relay: () => import("./relay.js"), more: () => import("./extras.js") };
const needCourse = (E) => { if (!E.cd.course) { E.toast(t("trc.dlg.needCourse")); return false; } return true; };
const needSel = (E, kind) => { if (E.sel?.kind !== kind && !(kind === "control" && E.sel?.kind === "number")) { E.toast(kind === "control" ? t("trc.dlg.needControl") : t("trc.dlg.needLeg")); return false; } return true; };

// A map lent (owner, 2026-11-16, after OCAD's encrypted maps): a member the team marked so sets courses on the map but neither
// prints nor exports it — the commands below are refused, the courses' PDF comes without the map. A browser can only
// discourage copying, never prevent it: the map is on the screen. The team's dialog says so.
/** A map lent to this member: said, and true — the caller makes no file of the map. */
export const lentStop = (E) => { if (!E.lent) return false; E.toast(t("trc.dlg.lentRefused"), 6000); return true; };
const LENT_BLOCK = new Set(["export-images", "export-ocad", "export-ocn", "export-geotiff", "export-svg", "export-kmz", "export-garmin", "export-livelox", "export-routegadget", "publish", "map-templates", "offline"]);
export async function action(E, act, btn, at = {}) {
  if (E.lent && LENT_BLOCK.has(act)) { E.toast(t("trc.dlg.lentRefused"), 6000); return; }
  const ev = E.ev, s = E.sel;
  const ro = () => { if (E.readOnly) { E.toast(t("trc.dlg.readOnly")); return true; } return false; };
  // the start screen's three choices (pages/tracer.js), from the Fichier menu too
  if (act.startsWith("start-")) { E.onStart?.(act.slice(6)); return; }
  // no event open yet: only the start screen leads somewhere
  if (E.blank && !["view-map", "view-course", "save-to"].includes(act)) { E.toast(t("trc.dlg.needEvent")); E.onStart?.(); return; }
  // the advanced level: administrators only, for now (owner, 2026-10-24)
  if (isPro({ act }) && !E.pro) { E.toast(t("trc.dlg.proOnly")); return; }
  switch (act) {
    case "save": await E.saveNow(true); break;
    case "export-ocn": exportOcn(E); break;
    case "version-save": versionSave(E); break;
    case "versions": versions(E); break;
    case "import-ppen": if (!ro()) importPpen(E); break;
    case "import-courses": if (!ro()) (await import("./iofin.js")).importDialog(E); break;
    case "classes": if (!ro()) (await import("./classes.js")).classesDialog(E); break;
    case "export-ppen": exportPpen(E); break;
    case "pdf-courses": (await lazy.pdf()).coursesDialog(E); break;
    case "pdf-course": if (needCourse(E)) (await lazy.pdf()).coursesDialog(E, { only: E.cd.course }); break;
    case "pdf-descriptions": (await lazy.pdf()).descriptionsDialog(E); break;
    case "pdf-punch": (await lazy.pdf()).punchDialog(E); break;
    case "export-iof3": (await lazy.out()).iofXml(E, 3); break;
    case "export-iof2": (await lazy.out()).iofXml(E, 2); break;
    case "export-gpx": (await lazy.out()).gpx(E); break;
    case "export-kml": (await lazy.out()).kml(E); break;
    case "export-images": (await lazy.out()).imagesDialog(E); break;
    case "export-ocad": (await import("./coursefiles.js")).courseFilesDialog(E); break;
    case "export-routegadget": (await lazy.out()).routeGadget(E); break;
    case "export-geotiff": (await import("./exportx.js")).geotiffDialog(E); break;
    case "export-svg": (await import("./exportx.js")).svgDialog(E); break;
    case "export-kmz": (await import("./exportx.js")).kmzDialog(E); break;
    case "export-garmin": (await import("./exportx.js")).garminDialog(E); break;
    case "export-maprun": (await import("./exportx.js")).maprunDialog(E); break;
    case "export-ocadcsv": (await import("./exportx.js")).ocadTextFile(E); break;
    case "export-iof2-sep": (await import("./exportx.js")).iof2Separate(E); break;
    case "export-livelox": (await import("./exportx.js")).liveloxPackage(E); break;
    case "export-csv": (await lazy.rep()).csvAll(E); break;
    case "publish": (await lazy.more()).publish(E); break;
    case "send-results": (await lazy.more()).sendCourses(E); break;
    case "offline": (await import("./offline.js")).offlineDialog(E); break;
    case "map-change": if (!ro()) (await lazy.more()).changeMap(E); break;
    case "maps": if (!ro()) (await import("./maps.js")).mapsDialog(E); break;
    case "map-colors": (await import("./mapview.js")).colorsDialog(E); break;
    case "exercise": if (!ro()) (await import("./mapview.js")).exerciseDialog(E); break;
    case "map-templates": (await import("./mapview.js")).templatesDialog(E); break;
    case "event-props": if (!ro()) eventProps(E); break;
    case "appearance": if (!ro()) appearance(E); break;
    case "standards": if (!ro()) standards(E); break;
    case "numbering": if (!ro()) numbering(E); break;
    case "codes": if (!ro()) changeCodes(E); break;
    case "renumber": if (!ro()) confirm(E, t("trc.dlg.renumberAsk"), t("trc.dlg.renumber"), () => E.change((x) => M.autoRenumber(x), t("trc.dlg.renumbering"))); break;
    case "remove-unused": if (!ro()) { const n = M.unusedControls(ev).length; if (!n) E.toast(t("trc.dlg.noUnused")); else confirm(E, tn("trc.dlg.removeUnusedAsk", n), t("trc.dlg.delete"), () => E.change((x) => { M.removeUnused(x); }, t("trc.dlg.unusedRemoved"))); } break;
    case "move-all": if (!ro()) moveAll(E); break;
    case "calage": if (!ro()) (await import("./calage.js")).calage(E, { fromPpen: false }); break;
    case "custom-text": if (!ro()) customText(E); break;
    // descriptions read from the map (autodesc.js): on or off for new controls (kept on this device), the table of map symbols
    case "auto-desc": { E.opts.autoDesc = !E.opts.autoDesc; try { const o = JSON.parse(localStorage.getItem(PREFS) || "{}"); o.autoDesc = E.opts.autoDesc; localStorage.setItem(PREFS, JSON.stringify(o)); } catch (e) { /* this visit */ }
      E.toast(t(E.opts.autoDesc ? "trc.ad.on" : "trc.ad.off"), 5000); E.ribbon?.update(); break; }
    case "desc-table": if (!ro()) (await import("./autodesc.js")).tableDialog(E); break;
    case "punch": if (!ro()) (await lazy.more()).punchPatterns(E); break;
    case "georef": (await lazy.more()).georef(E); break;
    case "load": if (!ro()) loads(E); break;
    case "team": team(E); break;
    case "encryption": encryption(E); break;
    case "course-new": if (!ro()) courseProps(E, 0); break;
    case "course-props": if (!ro() && needCourse(E)) courseProps(E, E.cd.course); break;
    case "course-dup": if (!ro() && needCourse(E)) { const v = await modal(E, { title: t("trc.dlg.dupTitle"), body: field(t("trc.dlg.dupName"), `<input name="name" value="${esc(t("trc.dlg.copyName", { name: E.course().name }))}" required>`), ok: t("trc.dlg.dup") }); if (v?.name) { let id; E.change((x) => { id = M.duplicateCourse(x, E.cd.course, v.name.trim()); }, t("trc.dlg.duplicated")); E.setCourse(id); } } break;
    case "course-delete": if (!ro() && needCourse(E)) confirm(E, t("trc.dlg.deleteCourseAsk", { name: E.course().name }), t("trc.dlg.delete"), () => { const id = E.cd.course; E.change((x) => M.deleteCourse(x, id), t("trc.dlg.courseDeleted")); E.setCourse(M.courseIds(E.ev)[0] || 0); }); break;
    case "course-order": if (!ro()) courseOrder(E); break;
    case "var-fork": case "var-loop": if (!ro() && needCourse(E) && needSel(E, "control")) addVariation(E, act === "var-loop"); break;
    case "var-delete": if (!ro() && needCourse(E) && needSel(E, "control")) E.change((x) => M.deleteVariation(x, E.cd, s.cc), t("trc.dlg.varDeleted")); break;
    // the advanced level: a diamond loop from the control chosen to the next; a random-order control; the finish on the start
    case "var-phi": if (!ro() && needCourse(E) && needSel(E, "control")) {
      const prob = M.variationProblem(ev, E.cd, s.cc, "phi");
      if (prob) { E.toast({ all: t("trc.dlg.varNoAll"), score: t("trc.dlg.varNoScore"), none: t("trc.dlg.chooseControl"), finish: t("trc.dlg.varNoLast"), exists: t("trc.dlg.varExists"), phi: t("trc.dlg.inPhi"), exit: t("trc.dlg.phiExit") }[prob]); break; }
      E.change((x) => M.addPhi(x, E.cd, s.cc), t("trc.dlg.phi"));
      E.toast(t("trc.dlg.phiHow"), 9000);
    } break;
    case "random-section": if (!ro() && needCourse(E) && needSel(E, "control") && s.cc) {
      if (M.isScore(ev, E.cd.course) || ev.controls[s.control]?.kind !== "normal") { E.toast(t("trc.dlg.randomNo")); break; }
      E.change((x) => { const cc = x.courseControls[s.cc]; if (cc.rnd) delete cc.rnd; else cc.rnd = true; }, t("trc.dlg.random"));
    } break;
    case "finish-at-start": if (!ro() && needCourse(E)) finishAtStart(E); break;
    case "control-lock": if (!ro() && s?.control) E.change((x) => { const k = x.controls[s.control]; if (k.locked) delete k.locked; else k.locked = true; }, t("trc.dlg.lock")); break;
    case "my-symbols": if (!ro()) (await import("./mysymbols.js")).mySymbolsDialog(E); break;
    case "relay": if (needCourse(E)) (await lazy.relay()).relayDialog(E); break;
    case "print-area": (await lazy.pdf()).printAreaDialog(E); break;
    case "canvases": (await import("./canvases.js")).canvasesDialog(E); break;
    case "part-options": if (!ro() && needCourse(E)) partOptions(E); break;
    case "rep-summary": (await lazy.rep()).summary(E); break;
    case "rep-legs": (await lazy.rep()).legLengthsReport(E); break;
    case "rep-cross": (await lazy.rep()).crossRefReport(E); break;
    case "rep-load": (await lazy.rep()).loadReportDialog(E); break;
    case "rep-audit": (await lazy.rep()).auditReport(E); break;
    case "rep-climb": (await import("./relief.js")).climbDialog(E); break;
    case "dem": (await import("./relief.js")).demDialog(E); break;
    case "backdrop": (await import("./backdrop.js")).toggle(E); break;
    case "import-track": if (!ro()) (await import("./backdrop.js")).importTrack(E); break;
    case "look-here": if (at.p) { const r = E.canvas.getBoundingClientRect(); (await import("./backdrop.js")).lookHere(E, at.p, r.left + (at.sx || 0), r.top + (at.sy || 0)); } break;
    case "profile": (await import("./relief.js")).profileDialog(E); break;
    case "routes": (await import("./analyzer.js")).toggle(E); break;
    case "route-calc": if (!ro()) (await import("./analyzer.js")).compute(E, s?.kind === "leg" ? "leg" : "course"); break;
    case "route-table": if (!ro()) (await import("./analyzer.js")).tableDialog(E); break;
    case "rep-routes": (await import("./analyzer.js")).reportDialog(E); break;
    case "rep-times": (await lazy.more()).winningTimes(E); break;
    case "rep-pickup": (await lazy.more()).pickup(E); break;
    case "tour": (await import("./tour.js")).tourDialog(E); break;
    case "rep-after": (await lazy.more()).afterRace(E); break;
    case "comments": (await lazy.more()).comments(E); break;
    case "field": (await lazy.more()).fieldMode(E); break;
    case "field-states": if (!ro()) fieldStates(E); break;
    case "view-course": E.fitCourse(); break;
    case "view-map": E.fitMap(); break;
    case "view-3d": (await import("./relief3d.js")).view3d(E); break;
    case "view-all": E.opts.allControls = !E.opts.allControls; E.refresh(); E.toast(E.opts.allControls ? t("trc.dlg.allShown") : t("trc.dlg.othersHidden")); break;
    case "view-printarea": E.opts.printArea = !E.opts.printArea; E.redraw(); break;
    case "save-to": { const v = await modal(E, { title: t("trc.dlg.severalFiles"), body: `<label class="tr-check"><input type="radio" name="how" value="folder"> ${esc(t("trc.dlg.saveToFolder"))}</label>
      <label class="tr-check"><input type="radio" name="how" value="zip"> ${esc(t("trc.dlg.saveToZip"))}</label><label class="tr-check"><input type="radio" name="how" value="" checked> ${esc(t("trc.dlg.saveToAsk"))}</label>` });
      if (v) { try { const o = JSON.parse(localStorage.getItem("ocn.tr.prefs") || "{}"); o.saveTo = v.how || null; localStorage.setItem("ocn.tr.prefs", JSON.stringify(o)); } catch (e) { /* not kept */ } } break; }
    case "view-others": (await lazy.more()).otherCourses(E); break;
    case "import-course": if (!ro()) (await lazy.more()).readCourseFromMap(E); break;
    case "take-lock": await E.takeLock(); break;
    case "route-draw": if (!ro() && s?.kind === "leg") { E.setTool("route"); const a = ev.controls[s.c1]; E.pending = { kind: "route", c1: s.c1, c2: s.c2, pts: [[a.x, a.y]] };
      E.ghost = { pts: E.pending.pts.slice() }; E.help(t("trc.dlg.routeHelp")); E.redraw(); } break;
    case "finish-draw": A.finishPending(E); break;
    case "cancel-draw": E.cancelPending?.(); break;
    case "overprint": if (!ro()) E.change((x) => { x.appearance.ocadOverprint = !x.appearance.ocadOverprint; }, t("trc.dlg.overprint")); break;
    // right-click and pane buttons
    case "delete": A.deleteSelection(E); break;
    case "control-props": if (s?.control) controlProps(E, s.control); break;
    case "rotate": rotateStretch(E, "rotate"); break;
    case "stretch": rotateStretch(E, "stretch"); break;
    case "toggle-exchange": if (!ro() && s?.cc) E.change((x) => { const cc = x.courseControls[s.cc]; cc.exchange = !cc.exchange; if (!cc.exchange) delete cc.flip; }, t("trc.dlg.mapExchange")); break;
    // ISCD 2024's map flip: the map exchange at this control is the same sheet turned over (its description line says so)
    case "toggle-flip": if (!ro() && s?.cc) E.change((x) => { const cc = x.courseControls[s.cc]; if (cc.flip) delete cc.flip; else { cc.exchange = true; cc.flip = true; } }, t("trc.dlg.mapFlip")); break;
    case "points": if (!ro() && s?.cc) { const v = await modal(E, { title: t("trc.dlg.pointsTitle"), body: field(t("trc.dlg.points"), `<input name="p" type="number" min="0" value="${ev.courseControls[s.cc].points || 0}">`) }); if (v) E.change((x) => { x.courseControls[s.cc].points = Math.max(0, Math.round(num(v.p)) || 0); }, t("trc.dlg.points")); } break;
    case "text-before": case "text-after": if (!ro() && s?.control) textLine(E, { control: s.control, cc: s.cc, textKind: act === "text-before" ? "beforeCourseControl" : "afterCourseControl" }); break;
    case "gap-add-circle": if (!ro() && s?.control && at.p) { const c = ev.controls[s.control], a = M.angleDeg([c.x, c.y], at.p), r = 10; E.change((x) => M.addCircleGap(x, s.control, M.gapScale(x, E.course()?.printScale || x.allControls.printScale), [c.x + Math.cos((a - r) * Math.PI / 180), c.y + Math.sin((a - r) * Math.PI / 180)], [c.x + Math.cos((a + r) * Math.PI / 180), c.y + Math.sin((a + r) * Math.PI / 180)]), t("trc.dlg.circleGap")); } break;
    case "number-auto": if (!ro() && s?.control) E.change((x) => { if (s.cc && x.courseControls[s.cc]) delete x.courseControls[s.cc].number; else delete x.controls[s.control].codeAngle; }, t("trc.dlg.numberAuto")); break;
    case "bend-add": if (!ro() && s?.kind === "leg" && at.p) E.change((x) => M.addBend(x, s.c1, s.c2, M.nearest(M.legPoints(x, s.c1, s.c2), at.p).at), t("trc.dlg.bendAdded")); break;
    case "bend-remove": { const h = A.handleAt(E, at.sx, at.sy); if (!ro() && h?.type === "bend") E.change((x) => M.removeBend(x, h.c1, h.c2, h.pt), t("trc.dlg.bendRemoved")); break; }
    case "gap-add-leg": if (!ro() && s?.kind === "leg" && at.p) { const pts = M.legPoints(ev, s.c1, s.c2), n = M.nearest(pts, at.p), w = 1.2 * (E.layout?.ratio || 1); E.change((x) => M.addLegGap(x, s.c1, s.c2, M.pointAt(pts, n.len - w), M.pointAt(pts, n.len + w)), t("trc.dlg.gap")); } break;
    case "gap-remove-leg": if (!ro() && s?.kind === "leg" && at.p) E.change((x) => M.removeLegGap(x, s.c1, s.c2, at.p), t("trc.dlg.gapClosed")); break;
    case "route-clear": if (!ro() && s?.kind === "leg") E.change((x) => M.clearLegRoutes(x, s.c1, s.c2, true), t("trc.dlg.routeCleared")); break;
    case "routes-alt": if (!ro() && s?.kind === "leg") { E.setTool("route"); const a = ev.controls[s.c1]; E.pending = { kind: "route", alt: true, c1: s.c1, c2: s.c2, pts: [[a.x, a.y]] };
      E.ghost = { pts: E.pending.pts.slice() }; E.help(t("trc.dlg.altHelp")); E.redraw(); } break;
    case "routes-alt-clear": if (!ro() && s?.kind === "leg") E.change((x) => M.setLegAlts(x, s.c1, s.c2, null), t("trc.dlg.altsCleared")); break;
    case "view-angles": (await import("./advview.js")).toggleAngles(E); break;
    case "view-nearest": (await import("./advview.js")).toggleNearest(E); break;
    case "rep-controls": (await lazy.rep()).controlsReport(E); break;
    case "trail-answer": (await lazy.rep()).trailReport(E); break;
    case "flag-none": case "flag-all": case "flag-begin": case "flag-end": if (!ro() && s?.kind === "leg") E.change((x) => M.setFlagging(x, s.c1, s.c2, act.slice(5)), t("trc.dlg.flagging")); break;
    case "special-props": if (!ro() && s?.kind === "special") specialProps(E, s.id); break;
    case "corner-add": if (!ro() && s?.kind === "special" && at.p) E.change((x) => M.addSpecialCorner(x, s.id, at.p), t("trc.dlg.cornerAdded")); break;
    case "corner-remove": { const h = A.handleAt(E, at.sx, at.sy); if (!ro() && h?.type === "corner") E.change((x) => M.removeSpecialCorner(x, h.id, h.pt), t("trc.dlg.cornerRemoved")); break; }
    case "displayed-courses": if (!ro() && s?.kind === "special") displayedCourses(E, s.id); break;
    case "mask-hole": if (!ro() && s?.kind === "special" && ev.specials[s.id]?.kind === "mask") (await import("./layoutx.js")).maskHole(E, s.id); break;
    case "mask-holes-clear": if (!ro() && s?.kind === "special") E.change((x) => { delete x.specials[s.id].holes; }, t("trc.dlg.maskHolesCleared")); break;
    default: E.toast(t("trc.dlg.unknownAction", { act }));
  }
  void btn;
}

// ---- dialogs -------------------------------------------------------------------------------------------------------------------
export async function eventTitle(E) {
  const v = await modal(E, { title: t("trc.dlg.eventTitle"), body: field(t("trc.dlg.eventTitleField"), `<input name="t" value="${esc(E.ev.title)}" required>`) });
  if (v) E.change((x) => { x.title = v.t.trim(); }, t("trc.dlg.title"));
}
/** The languages of Purple Pen's symbol file, by their own names (the event's, if another, kept). */
export function langChoices(cur) {
  const L = languages(), up = (s, k) => { try { return s.charAt(0).toLocaleUpperCase(k) + s.slice(1); } catch (e) { return s; } };
  const list = Object.entries(L).map(([k, v]) => [k, up(v.name || k, k)]).sort((a, b) => a[1].localeCompare(b[1], lang()));
  if (cur && !L[cur]) list.unshift([cur, t("trc.dlg.langMissing", { lang: cur })]);
  return list;
}
/** The fonts a text object offers, with the one it already names (a .ppen may name any). */
function fontChoices(cur) {
  const list = [["Arial", "Arial"], ["Roboto", "Roboto"], ["Roboto Condensed", "Roboto Condensed"], ["Times New Roman", "Times New Roman"], ["Courier New", "Courier New"]];
  if (cur && !list.some(([v]) => v === cur)) list.push([cur, t("trc.dlg.fontPrinted", { font: cur, family: FAMILY_LABEL[family(cur)] })]);
  return list;
}
async function eventProps(E) {
  const ev = E.ev;
  await loadSymbols();
  const v = await modal(E, { title: t("trc.dlg.eventProps"), body: `
    ${field(t("trc.dlg.eventTitleDesc"), `<input name="title" value="${esc(ev.title)}" required>`)}
    ${field(t("trc.dlg.mapScale"), `<input name="scale" value="${ev.map.scale}" inputmode="numeric" required>`, t("trc.dlg.mapScaleHint"))}
    ${ev.map.kind === "bitmap" ? field(t("trc.dlg.dpi"), `<input name="dpi" value="${ev.map.dpi}" inputmode="numeric">`, t("trc.dlg.dpiHint")) : ""}
    ${field(t("trc.dlg.acScale"), `<input name="acScale" value="${ev.allControls.printScale}" inputmode="numeric">`)}
    ${field(t("trc.dlg.descLang"), sel("lang", langChoices(ev.lang), ev.lang), t("trc.dlg.descLangHint"))}
    ${field(t("trc.dlg.notes"), `<textarea name="notes" rows="3">${esc(ev.notes || "")}</textarea>`)}
    ${E.pro ? `<h4 class="tr-pro-h">${esc(t("trc.dlg.advanced"))}</h4><div class="tr-grid2">
      ${field(t("trc.dlg.discipline"), sel("discipline", [["foot", t("trc.dlg.discFoot")], ["mtbo", t("trc.dlg.discMtbo")], ["ski", t("trc.dlg.discSki")], ["trail", t("trc.dlg.discTrail")]], ev.discipline || "foot"), t("trc.dlg.disciplineHint"))}
      ${field(t("trc.dlg.eventDate"), `<input type="date" name="date" value="${esc(ev.date || E.meta?.date || "")}">`)}
      <label class="tr-check"><input type="checkbox" name="dateInHeader" ${ev.dateInHeader ? "checked" : ""}> ${esc(t("trc.dlg.dateInHeader"))}</label></div>` : ""}`,
  validate: (o) => (!(num(o.scale) > 100) ? t("trc.dlg.badMapScale") : ev.map.kind === "bitmap" && !(num(o.dpi) > 10) ? t("trc.dlg.badDpi") : null) });
  if (!v) return;
  if (!["fr", "en"].includes(v.lang)) await (await import("./symbols.js")).loadAllTexts();
  E.change((x) => {
    x.title = v.title.trim(); x.notes = v.notes;
    const scale = num(v.scale);
    if (x.map.kind === "bitmap") { const dpi = num(v.dpi); x.map.w = x.map.w * x.map.dpi / dpi; x.map.h = x.map.h * x.map.dpi / dpi; x.map.dpi = dpi; }
    x.map.scale = scale; x.allControls.printScale = num(v.acScale) || scale; x.lang = v.lang;
    if (E.pro) {
      if (v.discipline && v.discipline !== "foot") x.discipline = v.discipline; else delete x.discipline;
      if (v.date) x.date = v.date; else delete x.date;
      if (v.dateInHeader) x.dateInHeader = true; else delete x.dateInHeader;
    }
  }, t("trc.dlg.eventProps"));
}
async function appearance(E) {
  const a = E.ev.appearance;
  // the default purple is the map's own when an OCAD or Mapper map has one (Purple Pen), else the IOF's
  const mp = mapPurple(E.map), dflt = mp || M.PURPLE, purple = a.purple || dflt, pct = (c) => c.map((x) => Math.round(x * 100)).join(" ");
  const cols = mapColors(E.map), vector = cols.length > 0;
  const layerId = cols.some(([id]) => id === a.lowerPurpleLayer) ? a.lowerPurpleLayer : defaultLayer(E.map);
  const blends = [["none", t("trc.dlg.blendNone")], ["blend", t("trc.dlg.blendBlend")], ...(vector ? [["layer", t("trc.dlg.blendLayer")]] : [])];
  const v = await modal(E, { title: t("trc.dlg.appearanceTitle"), wide: true, body: `
    <div class="tr-grid2">
    ${field(t("trc.dlg.circleSize"), `<input name="cs" value="${a.controlCircleSize}">`)}
    ${field(t("trc.dlg.lineWidth"), `<input name="lw" value="${a.lineWidth}">`)}
    ${field(t("trc.dlg.numberHeight"), `<input name="nh" value="${a.numberHeight}">`)}
    ${field(t("trc.dlg.centerDot"), `<input name="dot" value="${a.centerDot}">`)}
    ${field(t("trc.dlg.numberFont"), sel("font", [["Roboto", "Roboto"], ["Arial", "Arial (ISOM 2017)"]], a.numberFont))}
    <label class="tr-check"><input type="checkbox" name="bold" ${a.numberBold ? "checked" : ""}> ${esc(t("trc.dlg.numberBold"))}</label>
    ${field(t("trc.dlg.numberOutline"), `<input name="outline" value="${a.numberOutline}">`)}
    ${field(t("trc.dlg.autoLegGap"), `<input name="gap" value="${a.autoLegGap}">`, t("trc.dlg.autoLegGapHint"))}
    ${field(t("trc.dlg.itemScaling"), sel("scaling", [["None", t("trc.dlg.scaleNone")], ["RelativeToMap", t("trc.dlg.scaleMap")], ["RelativeTo15000", t("trc.dlg.scale15000")]], a.itemScaling))}
    ${field(t("trc.dlg.purpleBlend"), sel("blend", blends, a.blend === "layer" && !vector ? "blend" : a.blend), vector ? "" : t("trc.dlg.purpleBlendHint"))}
    ${vector ? field(t("trc.dlg.lowerPurple"), sel("layer", cols.map(([id, n]) => [id, n]), layerId), t("trc.dlg.lowerPurpleHint")) : ""}
    <label class="tr-check"><input type="checkbox" name="dpurple" ${a.purple ? "" : "checked"}> ${esc(t("trc.dlg.defaultPurple", { which: mp ? t("trc.dlg.purpleOfMap", { cmyk: pct(mp) }) : `IOF (${pct(M.PURPLE)})` }))}</label>
    ${field(t("trc.dlg.purpleCmyk"), `<input name="cmyk" value="${pct(purple)}">`, t("trc.dlg.purpleCmykHint"))}
    ${vector ? `<label class="tr-check"><input type="checkbox" name="over" ${a.ocadOverprint ? "checked" : ""}> ${esc(t("trc.dlg.mapOverprint"))}</label>` : ""}
    <label class="tr-check"><input type="checkbox" name="descPurple" ${a.descriptionsPurple ? "checked" : ""}> ${esc(t("trc.dlg.descPurple"))}</label>
    </div>`,
  onOpen: (f) => {
    const sync = () => {
      f.elements.cmyk.disabled = f.elements.dpurple.checked;
      if (f.elements.dpurple.checked) f.elements.cmyk.value = pct(dflt);
      if (f.elements.layer) f.elements.layer.disabled = f.elements.blend.value !== "layer";
    };
    f.elements.dpurple.addEventListener("change", sync); f.elements.blend.addEventListener("change", sync); sync();
  },
  validate: (o) => ([o.cs, o.lw, o.nh].some((x) => !(num(x) > 0)) ? t("trc.dlg.sizesPositive") : !o.dpurple && o.cmyk.trim().split(/[\s,;]+/).length !== 4 ? t("trc.dlg.fourNumbers") : null) });
  if (!v) return;
  E.change((x) => {
    const ap = x.appearance;
    ap.controlCircleSize = num(v.cs); ap.lineWidth = num(v.lw); ap.numberHeight = num(v.nh); ap.centerDot = Math.max(0, num(v.dot) || 0);
    ap.numberFont = v.font; ap.numberBold = v.bold; ap.numberOutline = Math.max(0, num(v.outline) || 0); ap.autoLegGap = Math.max(0, num(v.gap) || 0);
    ap.itemScaling = v.scaling; ap.blend = v.blend; ap.descriptionsPurple = v.descPurple;
    if (vector && v.blend === "layer" && v.layer != null) ap.lowerPurpleLayer = Number(v.layer);
    if (vector) ap.ocadOverprint = !!v.over;
    const cm = v.dpurple ? null : v.cmyk.trim().split(/[\s,;]+/).map((y) => Math.min(100, Math.max(0, num(y))) / 100);
    ap.purple = !cm || cm.every((y, i) => Math.abs(y - dflt[i]) < 0.005) ? null : cm;
  }, t("trc.dlg.appearance"));
}
async function standards(E) {
  const v = await modal(E, { title: t("trc.dlg.standards"), body: `
    ${field(t("trc.dlg.descStandard"), sel("desc", DESC_STANDARDS, E.ev.descStandard), t("trc.dlg.descStandardHint"))}
    ${field(t("trc.dlg.mapStandard"), sel("map", MAP_STANDARDS(), E.ev.appearance.mapStandard), t("trc.dlg.mapStandardHint"))}` });
  if (v) applyStandards(E, v.desc, v.map);
}
/** The standards offered (the dialog, the ribbon's fields): the descriptions' — ISCD 2024, the rule since 2024 —, the map's. */
export const DESC_STANDARDS = [["2024", "IOF 2024 (ISCD 2024)"], ["2018", "IOF 2018"], ["2004", "IOF 2004"]];
export const MAP_STANDARDS = () => [["2017", t("trc.dlg.isom2017")], ["Spr2019", "ISSprOM 2019 (sprint)"], ["Ski2019", t("trc.dlg.isskiom")], ["Mtbo2022", t("trc.dlg.ismtbom")], ["2000", "ISOM 2000"]];
/** The description and map standards (the dialog, the ribbon's fields). */
export function applyStandards(E, desc, map) {
  if (desc === E.ev.descStandard && map === E.ev.appearance.mapStandard) return;
  E.change((x) => {
    x.descStandard = desc; x.appearance.mapStandard = map;
    // symbols that do not exist in the new standard take their replacement (ChangeEvent.UpdateDescriptionToMatchStandard)
    for (const c of Object.values(x.controls)) c.symbols = c.symbols.map((id) => {
      if (!id || symbol(id, desc)) return id;
      const old = symbol(id, M.descBase(desc) === "2018" ? "2004" : "2018");
      return old?.repl && symbol(old.repl, desc) ? old.repl : id;
    });
  }, t("trc.dlg.standards"));
}
async function numbering(E) {
  const n = E.ev.numbering;
  const v = await modal(E, { title: t("trc.dlg.autoNumbering"), body: `${field(t("trc.dlg.firstCode"), `<input name="start" value="${n.start}" inputmode="numeric">`)}
    <label class="tr-check"><input type="checkbox" name="inv" ${n.noInvertible ? "checked" : ""}> ${esc(t("trc.dlg.noInvertible"))}</label>
    <label class="tr-check"><input type="checkbox" name="now"> ${esc(t("trc.dlg.renumberNow"))}</label>`,
  validate: (o) => (!(num(o.start) >= 1 && num(o.start) < 1000) ? t("trc.dlg.codeRange") : null) });
  if (!v) return;
  E.change((x) => { x.numbering = { start: Math.round(num(v.start)), noInvertible: v.inv }; if (v.now) M.autoRenumber(x); }, t("trc.dlg.numbering"));
}
async function changeCodes(E) {
  const ids = Object.keys(E.ev.controls).map(Number).filter((id) => E.ev.controls[id].kind === "normal").sort((a, b) => M.compareControls(E.ev, a, b));
  const v = await modal(E, { title: t("trc.dlg.changeCodes"), wide: true, body: `<div class="tr-codes">${ids.map((id) => `<label>${esc(E.ev.controls[id].code)} → <input name="c${id}" value="${esc(E.ev.controls[id].code)}" size="4" maxlength="3"></label>`).join("")}</div>`,
    validate: (o) => {
      const codes = ids.map((id) => o[`c${id}`].trim());
      if (codes.some((c) => !c || c.length > 3 || /\s/.test(c))) return t("trc.dlg.codesFormat");
      const dup = codes.find((c, i) => codes.indexOf(c) !== i);
      return dup ? t("trc.dlg.codeTwice", { code: dup }) : null;
    } });
  if (v) E.change((x) => { for (const id of ids) x.controls[id].code = v[`c${id}`].trim(); }, t("trc.dlg.codesChanged"));
}
async function moveAll(E) {
  const v = await modal(E, { title: t("trc.dlg.moveAll"), body: `<p>${esc(t("trc.dlg.moveAllIntro"))}</p>
    <div class="tr-grid2">${field(t("trc.dlg.shiftRight"), '<input name="dx" value="0">')}${field(t("trc.dlg.shiftUp"), '<input name="dy" value="0">')}
    ${field(t("trc.dlg.rotation"), '<input name="rot" value="0">')}${field(t("trc.dlg.scaleFactor"), '<input name="k" value="1">')}</div>
    <p class="tr-hint">${esc(t("trc.dlg.moveAllHint"))}</p>` });
  if (!v) return;
  const dx = num(v.dx) || 0, dy = num(v.dy) || 0, a = (num(v.rot) || 0) * Math.PI / 180, k = num(v.k) || 1;
  const cs = Object.values(E.ev.controls), cx = cs.reduce((s, c) => s + c.x, 0) / (cs.length || 1), cy = cs.reduce((s, c) => s + c.y, 0) / (cs.length || 1);
  const c = Math.cos(a) * k, sn = Math.sin(a) * k;
  E.change((x) => M.transformAll(x, [c, -sn, sn, c, cx - c * cx + sn * cy + dx, cy - sn * cx - c * cy + dy]), t("trc.dlg.allMoved"));
}
const loadMore = () => { try { return localStorage.getItem("ocn.tr.courseMore") === "1"; } catch (e) { return false; } };
export async function courseProps(E, courseId, focus = null) {
  const c = courseId ? E.ev.courses[courseId] : null;
  const isNew = !c;
  const d = c || { kind: "normal", name: "", printScale: E.ev.map.scale, climb: -1, length: null, secondary: "", descKind: "symbols", labels: "sequence", firstNumber: 1, scoreColumn: 0, hideFromReports: false, load: -1 };
  // the essentials first; the rest folded for a new course (open for an existing one, and once opened it stays so), the fields
  // of a score course shown only for one (owner, 2026-11-17: twelve fields at once for a name)
  const more = !isNew || !!focus || loadMore();
  const v = await modal(E, { title: isNew ? t("trc.dlg.newCourse") : t("trc.dlg.courseProps", { name: c.name }), wide: true, ok: isNew ? t("trc.dlg.courseCreate") : "OK", body: `<div class="tr-grid2">
    ${field(t("trc.dlg.name"), `<input name="name" value="${esc(d.name)}" required>`)}
    ${field(t("trc.dlg.type"), sel("kind", [["normal", t("trc.dlg.normalCourse")], ["score", t("trc.dlg.scoreCourse")]], d.kind))}
    ${field(t("trc.dlg.classes"), `<input name="secondary" value="${esc(d.secondary || "")}" placeholder="${esc(t("trc.dlg.classesPlaceholder"))}">`, t("trc.dlg.classesHint"))}
    ${field(t("trc.dlg.printScale"), `<input name="ps" value="${d.printScale}" inputmode="numeric" required>`)}</div>
    <details class="tr-details tr-course-more" ${more ? "open" : ""}><summary>${esc(t("trc.dlg.courseMore"))}</summary><div class="tr-grid2">
    ${field(t("trc.dlg.climb"), `<input name="climb" value="${d.climb >= 0 ? d.climb : ""}" inputmode="numeric">`)}
    ${field(t("trc.dlg.length"), `<input name="length" value="${d.length ?? ""}" inputmode="decimal">`)}
    ${field(t("trc.dlg.expected"), `<input name="load" value="${d.load >= 0 ? d.load : ""}" inputmode="numeric">`)}
    ${field(t("trc.dlg.descriptions"), sel("descKind", [["symbols", t("trc.dlg.symbols")], ["text", t("trc.dlg.text")], ["symbols-and-text", t("trc.dlg.symbolsAndText")]], d.descKind))}
    ${field(t("trc.dlg.labels"), sel("labels", [["sequence", t("trc.dlg.lblSequence")], ["code", t("trc.dlg.lblCode")], ["sequence-and-code", t("trc.dlg.lblSeqCode")], ["sequence-and-score", t("trc.dlg.lblSeqScore")], ["code-and-score", t("trc.dlg.lblCodeScore")], ["score", t("trc.dlg.points")]], d.labels))}
    ${field(t("trc.dlg.firstNumber"), `<input name="first" value="${d.firstNumber}" inputmode="numeric">`)}
    <div data-score>${field(t("trc.dlg.scoreColumn"), sel("scoreCol", [["0", "A"], ["1", "B"], ["7", "H"], ["-1", t("trc.dlg.scoreColNone")]], d.scoreColumn ?? 0))}</div>
    <label class="tr-check"><input type="checkbox" name="hide" ${d.hideFromReports ? "checked" : ""}> ${esc(t("trc.dlg.testCourse"))}</label></div>
    ${E.pro ? `<h4 class="tr-pro-h">${esc(t("trc.dlg.advanced"))}</h4><div class="tr-grid2">
      ${field(t("trc.dlg.form"), sel("form", [["", t("trc.dlg.formNormal")], ["string", t("trc.dlg.formString")], ["trail", t("trc.dlg.formTrail")]], d.form || ""))}
      ${field(t("trc.dlg.discipline"), sel("discipline", [["", t("trc.dlg.discEvent")], ["foot", t("trc.dlg.discFoot")], ["mtbo", t("trc.dlg.discMtbo")], ["ski", t("trc.dlg.discSki")], ["trail", t("trc.dlg.discTrail")]], d.discipline || ""))}
      ${field(t("trc.dlg.lengthBy"), sel("lengthBy", [["", t("trc.dlg.lengthByDefault")], ["main", t("trc.dlg.lengthByMain")], ["route", t("trc.dlg.lengthByRoute")], ["straight", t("trc.dlg.lengthByStraight")]], d.lengthBy || ""), t("trc.dlg.lengthByHint"))}</div>
      <div class="tr-checkrow"><label class="tr-check"><input type="checkbox" name="legLines" ${d.legLines !== false ? "checked" : ""}> ${esc(t("trc.dlg.legLines"))}</label>
      <label class="tr-check" data-score><input type="checkbox" name="rogaine" ${d.rogaine ? "checked" : ""}> ${esc(t("trc.dlg.rogaine"))}</label>
      <label class="tr-check" data-score><input type="checkbox" name="allControls" ${d.allControls ? "checked" : ""}> ${esc(t("trc.dlg.allControlsCourse"))}</label></div>` : ""}</details>`,
  onOpen: (f) => {
    // a score course's own fields, and its ways of labelling the controls
    const sync = () => {
      const score = f.elements.kind.value === "score";
      f.querySelectorAll("[data-score]").forEach((el) => { el.hidden = !score; });
      for (const o of f.elements.labels.options) o.hidden = !score && !["sequence", "code", "sequence-and-code"].includes(o.value);
    };
    f.elements.kind.addEventListener("change", sync); sync();
    f.querySelector(".tr-course-more").addEventListener("toggle", (e) => { try { localStorage.setItem("ocn.tr.courseMore", e.target.open ? "1" : "0"); } catch (err) { /* this visit */ } });
    if (focus) f.elements[focus]?.focus();
  },
  validate: (o) => (!o.name.trim() ? t("trc.dlg.needName") : !(num(o.ps) > 100) ? t("trc.dlg.badPrintScale") : o.climb && !(num(o.climb) >= 0) ? t("trc.dlg.badClimb") : o.length && !(num(o.length) > 0) ? t("trc.dlg.badLength") : null) });
  if (!v) return;
  const props = { name: v.name.trim(), kind: v.kind, secondary: v.secondary.trim() || null, climb: v.climb === "" ? -1 : num(v.climb), length: v.length === "" ? null : num(v.length),
    printScale: num(v.ps), descKind: v.descKind, labels: v.kind === "score" ? v.labels : ["sequence", "code", "sequence-and-code"].includes(v.labels) ? v.labels : "sequence",
    firstNumber: Math.max(1, Math.round(num(v.first)) || 1), scoreColumn: v.kind === "score" ? Number(v.scoreCol) : -1, hideFromReports: v.hide, load: v.load === "" ? -1 : Math.round(num(v.load)) };
  // the advanced level's settings (absent: as before)
  if (E.pro) Object.assign(props, { form: v.form || undefined, legLines: v.form ? v.legLines : undefined, discipline: v.discipline || undefined, lengthBy: v.lengthBy || undefined,
    rogaine: v.kind === "score" && v.rogaine ? true : undefined, allControls: v.kind === "score" && v.allControls ? true : undefined });
  for (const k of Object.keys(props)) if (props[k] === undefined) props[k] = null;
  if (isNew) {
    let id;
    E.change((x) => { id = M.createCourse(x, props); Object.assign(x.courses[id], props); }, t("trc.dlg.newCourse"));
    E.setCourse(id);
    // what comes next, nine times in ten: its controls, clicked in order — the control tool in hand, its button in sight
    if (E.ribbon) { E.ribbon.tab = "home"; E.ribbon.prevTab = "home"; }
    E.setTool("control"); E.ribbon?.update?.();
    E.toast(t("trc.dlg.courseCreated", { name: props.name }), 7000);
  } else E.change((x) => Object.assign(x.courses[courseId], props), t("trc.dlg.courseProperties"));
}
async function courseOrder(E) {
  const ids = M.courseIds(E.ev);
  const v = await modal(E, { title: t("trc.dlg.courseOrder"), body: `<ol class="tr-order">${ids.map((id) => `<li data-id="${id}"><span>${esc(E.ev.courses[id].name)}</span>
    <button type="button" class="btn btn-sm" data-up>▲</button><button type="button" class="btn btn-sm" data-down>▼</button></li>`).join("")}</ol><input type="hidden" name="order">`,
  onOpen: (f) => {
    const list = f.querySelector(".tr-order");
    const sync = () => { f.elements.order.value = [...list.children].map((li) => li.dataset.id).join(","); };
    list.addEventListener("click", (e) => {
      const li = e.target.closest("li"); if (!li) return;
      if (e.target.closest("[data-up]") && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
      if (e.target.closest("[data-down]") && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
      sync();
    });
    sync();
  } });
  if (v) E.change((x) => { v.order.split(",").map(Number).forEach((id, i) => { x.courses[id].order = i + 1; }); }, t("trc.dlg.courseOrder"));
}
async function addVariation(E, loop) {
  const prob = M.variationProblem(E.ev, E.cd, E.sel.cc);
  if (prob) { E.toast({ all: t("trc.dlg.varNoAll"), score: t("trc.dlg.varNoScore"), none: t("trc.dlg.chooseControl"), finish: t("trc.dlg.varNoLast"), exists: t("trc.dlg.varExists") }[prob]); return; }
  // up to 20 branches at the advanced level (Condes), 8 as in Purple Pen otherwise
  const max = E.pro ? 20 : 8;
  const v = await modal(E, { title: loop ? t("trc.dlg.loops") : t("trc.dlg.fork"), body: field(loop ? t("trc.dlg.nLoops") : t("trc.dlg.nBranches"), `<input name="n" type="number" min="2" max="${max}" value="2">`,
    loop ? t("trc.dlg.loopsHint") : t("trc.dlg.forkHint")) });
  if (!v) return;
  E.change((x) => M.addVariation(x, E.cd, E.sel.cc, loop, Math.max(2, Math.min(max, Math.round(num(v.n)) || 2))), loop ? t("trc.dlg.loops") : t("trc.dlg.fork"));
}
/** The field mode's states named by the event (the advanced level; Condes's five named flags): the four of the field mode, and a fifth. */
async function fieldStates(E) {
  const n = E.ev.fieldStates || {};
  const v = await modal(E, { title: t("trc.dlg.fieldStates"), body: `<p>${esc(t("trc.dlg.fieldStatesIntro"))}</p><div class="tr-grid2">
    ${[["set", t("trc.team.stSet")], ["checked", t("trc.team.stChecked")], ["collected", t("trc.team.stCollected")], ["problem", t("trc.team.stProblem")], ["extra", t("trc.dlg.fieldExtra")]]
      .map(([k, d]) => field(d, `<input name="${k}" value="${esc(n[k] || "")}" placeholder="${esc(k === "extra" ? t("trc.dlg.fieldExtraPh") : d)}" maxlength="40">`)).join("")}</div>` });
  if (!v) return;
  E.change((x) => { const o = {}; for (const k of ["set", "checked", "collected", "problem", "extra"]) if (v[k].trim()) o[k] = v[k].trim(); if (Object.keys(o).length) x.fieldStates = o; else delete x.fieldStates; }, t("trc.dlg.fieldStates"));
}
/** The course's finish drawn on its start (Condes: a course that ends where it began): the finish follows the start wherever it
 *  goes. A finish other courses use elsewhere is left to them; this course gets one of its own. */
function finishAtStart(E) {
  const id = E.cd.course, ev = E.ev, st = M.findKind(ev, id, "start");
  if (!st) { E.toast(t("trc.dlg.needStart")); return; }
  const start = ev.courseControls[st].control, last = M.lastCC(ev, id, false);
  const fin = last && M.kindOfCC(ev, last) === "finish" ? ev.courseControls[last].control : 0;
  E.change((x) => {
    const s = x.controls[start];
    if (fin && x.controls[fin].atStart === start) { delete x.controls[fin].atStart; return; }   // a second time: undone
    const shared = fin && M.coursesUsing(x, fin).some((c) => c !== id && M.findKind(x, c, "start") && x.courseControls[M.findKind(x, c, "start")].control !== start);
    let f = fin;
    if (!fin || shared) { f = M.addControl(x, "finish", [s.x, s.y]); M.addFinish(x, f, id); }
    x.controls[f].atStart = start;
  }, t("trc.dlg.finishAtStart"));
}
async function partOptions(E) {
  if (E.cd.part < 0) { E.toast(t("trc.dlg.choosePart")); return; }
  const o = M.partOptions(E.ev, E.cd);
  const v = await modal(E, { title: t("trc.dlg.part", { n: E.cd.part + 1 }), body: `<label class="tr-check"><input type="checkbox" name="sf" ${o.showFinish ? "checked" : ""}> ${esc(t("trc.dlg.showFinish"))}</label>` });
  if (v) E.change((x) => { x.courses[E.cd.course].partOptions = { ...(x.courses[E.cd.course].partOptions || {}), [E.cd.part]: { showFinish: v.sf } }; }, t("trc.dlg.partOptions"));
}
async function loads(E) {
  const ids = M.courseIds(E.ev);
  const v = await modal(E, { title: t("trc.dlg.loads"), body: `<p>${esc(t("trc.dlg.loadsIntro"))}</p>
    <table class="tr-table"><tbody>${ids.map((id) => `<tr><td>${esc(E.ev.courses[id].name)}</td><td><input name="l${id}" value="${E.ev.courses[id].load >= 0 ? E.ev.courses[id].load : ""}" size="5" inputmode="numeric"></td></tr>`).join("")}</tbody></table>
    <p class="tr-hint">${esc(t("trc.dlg.loadsKnown"))} <button type="button" class="btn btn-sm" id="tr-loads-fill">${esc(t("trc.dlg.loadsFill"))}</button></p>`,
  onOpen: (f) => f.querySelector("#tr-loads-fill").addEventListener("click", async () => {
    const fill = await (await import("./extras.js")).registrationLoads(E);
    if (!fill) return;
    for (const id of ids) if (fill[id] != null) f.elements[`l${id}`].value = fill[id];
  }) });
  if (v) E.change((x) => { for (const id of ids) x.courses[id].load = v[`l${id}`] === "" ? -1 : Math.max(0, Math.round(num(v[`l${id}`])) || 0); }, t("trc.dlg.loads"));
}
export async function customText(E, controlId = null) {
  if (controlId) {
    const c = E.ev.controls[controlId];
    const v = await modal(E, { title: t("trc.dlg.descText"), body: field(t("trc.dlg.descTextField"), `<textarea name="t" rows="3">${esc(c.descText || "")}</textarea>`) });
    if (v) E.change((x) => { x.controls[controlId].descText = v.t.trim() || undefined; if (!v.t.trim()) delete x.controls[controlId].descText; }, t("trc.dlg.descText"));
    return;
  }
  (await import("./extras.js")).customSymbolText(E);
}
export async function textLine(E, line) {
  const cc = line.cc ? E.ev.courseControls[line.cc] : null, c = E.ev.controls[line.control];
  const before = line.textKind?.startsWith("before"), onCourse = line.textKind?.includes("Course");
  const cur = onCourse ? (before ? cc?.before : cc?.after) : (before ? c.before : c.after);
  const v = await modal(E, { title: before ? t("trc.dlg.textBefore") : t("trc.dlg.textAfter"), body: `${field(t("trc.dlg.textLineField"), `<input name="t" value="${esc(cur || "")}">`)}
    <label class="tr-check"><input type="checkbox" name="all" ${!onCourse ? "checked" : ""}> ${esc(t("trc.dlg.textAllCourses"))}</label>` });
  if (!v) return;
  E.change((x) => {
    const t = v.t.trim() || undefined, key = before ? "before" : "after";
    if (v.all) { x.controls[line.control][key] = t; if (cc) delete x.courseControls[line.cc][key]; }
    else if (line.cc) { x.courseControls[line.cc][key] = t; }
    for (const o of [x.controls[line.control], line.cc ? x.courseControls[line.cc] : null]) if (o && !o[key]) delete o[key];
  }, t("trc.dlg.textLine"));
}
export async function codeEdit(E, controlId) {
  const c = E.ev.controls[controlId];
  const v = await modal(E, { title: t("trc.dlg.controlCode"), body: field(t("trc.dlg.codeField"), `<input name="code" value="${esc(c.code)}" maxlength="3" required>`),
    validate: (o) => { const p = M.codeProblem(E.ev, o.code.trim()), other = M.findCode(E.ev, o.code.trim()); return p === "length" || p === "space" ? t("trc.dlg.codeFormat") : other && other !== controlId ? t("trc.dlg.codeTaken") : null; } });
  if (v) E.change((x) => { x.controls[controlId].code = v.code.trim(); }, t("trc.dlg.codeChanged"));
}
export async function controlProps(E, controlId) {
  const c = E.ev.controls[controlId];
  const v = await modal(E, { title: c.kind === "normal" ? t("trc.dlg.controlTitle", { code: c.code }) : t("trc.dlg.start"), body: `
    ${c.kind === "normal" ? field(t("trc.dlg.code"), `<input name="code" value="${esc(c.code)}" maxlength="3">`)
      : E.ev.descStandard === "2024" ? field(t("trc.dlg.startCode"), `<input name="scode" value="${esc(c.code || "")}" maxlength="3" placeholder="S1">`, t("trc.dlg.startCodeHint")) : ""}
    ${field(t("trc.dlg.colF"), `<input name="f" value="${esc(c.colF || "")}" placeholder="2.5, 3x4, 2/1">`)}
    ${field(t("trc.dlg.descTextShort"), `<textarea name="t" rows="2">${esc(c.descText || "")}</textarea>`)}
    ${field(t("trc.dlg.teamNotes"), `<textarea name="notes" rows="2">${esc(c.notes || "")}</textarea>`)}
    ${E.pro ? `<h4 class="tr-pro-h">${esc(t("trc.dlg.advanced"))}</h4><div class="tr-grid2">
      ${c.kind === "normal" ? field(t("trc.dlg.units"), `<input name="units" value="${esc((c.units || []).join(", "))}" placeholder="131, 231">`, t("trc.dlg.unitsHint")) : '<input type="hidden" name="units" value="">'}
      <label class="tr-check"><input type="checkbox" name="locked" ${c.locked ? "checked" : ""}> ${esc(t("trc.dlg.locked"))}</label>
      ${c.kind === "normal" ? `${field(t("trc.dlg.trailFlags"), sel("flags", [["", "—"], ...["A", "A-B", "A-C", "A-D", "A-E", "A-F"].map((x) => [x, x.replace("-", "–")])], c.trail?.flags || ""))}
      ${field(t("trc.dlg.trailAnswer"), sel("answer", [["", "—"], ...["Z", "A", "B", "C", "D", "E", "F"].map((x) => [x, x])], c.trail?.answer || ""), t("trc.dlg.trailAnswerHint"))}` : ""}</div>` : ""}
    <p class="tr-hint">${esc(t("trc.dlg.symbolsHint"))}</p>`,
  validate: (o) => { if (c.kind !== "normal") return null; const p = M.codeProblem(E.ev, o.code.trim()), other = M.findCode(E.ev, o.code.trim()); return p === "length" || p === "space" ? t("trc.dlg.codeFormatShort") : other && other !== controlId ? t("trc.dlg.codeTaken") : null; } });
  if (!v) return;
  E.change((x) => {
    const k = x.controls[controlId];
    if (k.kind === "normal") k.code = v.code.trim();
    else if (v.scode != null) { if (v.scode.trim()) k.code = v.scode.trim(); else delete k.code; }
    k.colF = v.f.trim() || null; if (k.colF) k.symbols[3] = null;
    if (v.t.trim()) k.descText = v.t.trim(); else delete k.descText;
    if (v.notes.trim()) k.notes = v.notes.trim(); else delete k.notes;
    if (E.pro) {
      const units = String(v.units || "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
      if (units.length) k.units = units; else delete k.units;
      if (v.locked) k.locked = true; else delete k.locked;
      if (v.flags || v.answer) k.trail = { flags: v.flags || "", answer: v.answer || "" }; else delete k.trail;
    }
  }, t("trc.dlg.controlChanged"));
}
async function rotateStretch(E, what) {
  const s = E.sel;
  const obj = s?.kind === "special" ? E.ev.specials[s.id] : s?.control ? E.ev.controls[s.control] : null;
  if (!obj || !(obj.kind === "crossing" || M.ORIENTED_SPECIALS.includes(obj.kind))) { E.toast(t("trc.dlg.chooseCrossing")); return; }
  const v = await modal(E, { title: what === "rotate" ? t("trc.dlg.orientation") : t("trc.dlg.stretch"), body: what === "rotate"
    ? field(t("trc.dlg.orientationField"), `<input name="v" value="${Math.round(obj.orientation || 0)}">`)
    : field(t("trc.dlg.stretchField"), `<input name="v" value="${obj.stretch || 0}">`) });
  if (!v) return;
  E.change((x) => { const o = s.kind === "special" ? x.specials[s.id] : x.controls[s.control]; if (what === "rotate") o.orientation = num(v.v) || 0; else o.stretch = Math.max(0, num(v.v) || 0); }, what === "rotate" ? t("trc.dlg.orientation") : t("trc.dlg.stretch"));
}
export async function specialProps(E, id) {
  const sp = E.ev.specials[id];
  if (sp.kind === "inset") return (await import("./layoutx.js")).insetProps(E, id);
  if (sp.kind === "qr") return (await import("./qr.js")).qrProps(E, id, (look) => E.change((x) => Object.assign(x.specials[id], look), t("trc.dlg.qrChanged")));
  if (sp.kind === "text") return textProps(E, id, (look) => E.change((x) => Object.assign(x.specials[id], look), t("trc.dlg.textChanged")));
  if (["line", "rectangle", "ellipse"].includes(sp.kind)) return lineAppearance(E, id, (look) => E.change((x) => Object.assign(x.specials[id], look), t("trc.dlg.appearance")));
  if (sp.kind === "descriptions") {
    const v = await modal(E, { title: t("trc.dlg.descOnMap"), body: field(t("trc.dlg.nColumns"), `<input name="c" type="number" min="1" max="6" value="${sp.columns || 1}">`) });
    if (v) E.change((x) => { x.specials[id].columns = Math.max(1, Math.min(6, Math.round(num(v.c)) || 1)); }, t("trc.dlg.columns"));
  }
}
const COLOR_OPTS = [["purple", t("trc.dlg.colPurple")], ["lower-purple", t("trc.dlg.colLowerPurple")], ["black", t("trc.dlg.colBlack")], ["custom", t("trc.dlg.colCmyk")]];
export async function textProps(E, id, then) {
  const sp = id ? E.ev.specials[id] : { text: "$(CourseName)", font: { name: "Arial", bold: true, italic: false, height: -1 }, color: "purple" };
  const col = Array.isArray(sp.color) ? "custom" : sp.color;
  const v = await modal(E, { title: t("trc.dlg.text"), body: `
    ${field(t("trc.dlg.text"), `<textarea name="text" rows="3">${esc(sp.text)}</textarea>`, t("trc.dlg.textFields", { fields: "$(EventTitle) $(CourseName) $(CourseLength) $(CourseClimb) $(ClassList) $(PrintScale) $(CoursePart) $(Variation) $(RelayTeam) $(RelayLeg)" }))}
    <div class="tr-grid2">${field(t("trc.dlg.font"), sel("font", fontChoices(sp.font?.name || "Arial"), sp.font?.name || "Arial"), t("trc.dlg.fontHint"))}
    ${field(t("trc.dlg.capHeight"), `<input name="h" value="${sp.font?.height > 0 ? sp.font.height : ""}">`)}
    <label class="tr-check"><input type="checkbox" name="bold" ${sp.font?.bold ? "checked" : ""}> ${esc(t("trc.dlg.bold"))}</label><label class="tr-check"><input type="checkbox" name="italic" ${sp.font?.italic ? "checked" : ""}> ${esc(t("trc.dlg.italic"))}</label>
    ${field(t("trc.dlg.colour"), sel("color", COLOR_OPTS, col))}${field(t("trc.dlg.cmyk"), `<input name="cmyk" value="${Array.isArray(sp.color) ? sp.color.map((x) => Math.round(x * 100)).join(" ") : "0 0 0 100"}">`)}</div>` });
  if (!v) return;
  then({ text: v.text, font: { name: v.font, bold: v.bold, italic: v.italic, height: v.h === "" ? -1 : num(v.h) }, color: v.color === "custom" ? v.cmyk.trim().split(/[\s,;]+/).map((x) => (num(x) || 0) / 100) : v.color });
}
export async function lineAppearance(E, idOrKind, then) {
  const sp = typeof idOrKind === "number" ? E.ev.specials[idOrKind] : { lineKind: "single", lineWidth: 0.35, gapSize: 0.5, dashSize: 1.5, radius: 0, color: "purple" };
  const col = Array.isArray(sp.color) ? "custom" : sp.color || "purple";
  const v = await modal(E, { title: t("trc.dlg.lineAppearance"), body: `<div class="tr-grid2">
    ${field(t("trc.dlg.line"), sel("kind", [["single", t("trc.dlg.lineSingle")], ["double", t("trc.dlg.lineDouble")], ["dashed", t("trc.dlg.lineDashed")]], sp.lineKind || "single"))}
    ${field(t("trc.dlg.lineWidthMm"), `<input name="w" value="${sp.lineWidth || 0.35}">`)}
    ${field(t("trc.dlg.gapMm"), `<input name="gap" value="${sp.gapSize || 0.5}">`)}${field(t("trc.dlg.dashMm"), `<input name="dash" value="${sp.dashSize || 1.5}">`)}
    ${(sp.kind === "rectangle" || idOrKind === "rectangle") ? field(t("trc.dlg.radiusMm"), `<input name="r" value="${sp.radius || 0}">`) : '<input type="hidden" name="r" value="0">'}
    ${field(t("trc.dlg.colour"), sel("color", COLOR_OPTS, col))}${field(t("trc.dlg.cmyk"), `<input name="cmyk" value="${Array.isArray(sp.color) ? sp.color.map((x) => Math.round(x * 100)).join(" ") : "0 0 0 100"}">`)}</div>` });
  if (!v) return;
  then({ lineKind: v.kind, lineWidth: num(v.w) || 0.35, gapSize: num(v.gap) || 0, dashSize: num(v.dash) || 0, radius: num(v.r) || 0,
    color: v.color === "custom" ? v.cmyk.trim().split(/[\s,;]+/).map((x) => (num(x) || 0) / 100) : v.color });
}
export async function imageFile(E, then) {
  const v = await modal(E, { title: t("trc.dlg.image"), body: field(t("trc.dlg.imageField"), '<input type="file" name="f" accept="image/png,image/jpeg">'), validate: (o) => (!o.f?.length ? t("trc.dlg.chooseImage") : null) });
  if (!v) return;
  const f = v.f[0], buf = new Uint8Array(await f.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  then({ image: { format: /png/i.test(f.type) ? "png" : "jpeg", data: btoa(s) }, text: f.name });
}
async function displayedCourses(E, id) {
  const sp = E.ev.specials[id], ids = M.courseIds(E.ev);
  const on = (c, part = -1) => sp.all || sp.courses.some((x) => x.course === c && (x.part ?? -1) === part);
  const v = await modal(E, { title: t("trc.dlg.objCourses"), body: `<div class="tr-checks">
    <label class="tr-check"><input type="checkbox" name="c0" ${on(0) ? "checked" : ""}> ${esc(t("trc.dlg.allControls"))}</label>
    ${ids.map((c) => `<label class="tr-check"><input type="checkbox" name="c${c}" ${on(c) ? "checked" : ""}> ${esc(E.ev.courses[c].name)}</label>`).join("")}</div>
    <p><button type="button" class="btn btn-sm" id="tr-all">${esc(t("trc.dlg.all"))}</button> <button type="button" class="btn btn-sm" id="tr-none">${esc(t("trc.dlg.none"))}</button></p>`,
  onOpen: (f) => {
    f.querySelector("#tr-all").addEventListener("click", () => f.querySelectorAll("input[type=checkbox]").forEach((x) => { x.checked = true; }));
    f.querySelector("#tr-none").addEventListener("click", () => f.querySelectorAll("input[type=checkbox]").forEach((x) => { x.checked = false; }));
  } });
  if (!v) return;
  const cds = [0, ...ids].filter((c) => v[`c${c}`]).map((c) => ({ course: c, part: -1 }));
  E.change((x) => M.setDisplayedCourses(x, id, cds), t("trc.dlg.objCoursesChanged"));
}
export function issueKind(E, then) {
  modal(E, { title: t("trc.dlg.issuePoint"), body: `<p>${esc(t("trc.dlg.issueWhere"))}</p>
    <label class="tr-check"><input type="radio" name="k" value="beginning" checked> ${esc(t("trc.dlg.issueBeginning"))}</label>
    <label class="tr-check"><input type="radio" name="k" value="middle"> ${esc(t("trc.dlg.issueMiddle"))}</label>
    <label class="tr-check"><input type="radio" name="k" value="end"> ${esc(t("trc.dlg.issueEnd"))}</label>` }).then((v) => { if (v) then(v.k); });
}
export async function sharedMove(E, hit, others, to) {
  const names = others.map((x) => E.ev.courses[x].name).join(", ");
  const v = await modal(E, { title: t("trc.dlg.shared"), body: `<p>${esc(t("trc.dlg.sharedAlso", { courses: names }))}</p>
    <label class="tr-check"><input type="radio" name="w" value="all" checked> ${esc(t("trc.dlg.sharedMoveAll"))}</label>
    <label class="tr-check"><input type="radio" name="w" value="new"> ${esc(t("trc.dlg.sharedNew"))}</label>` });
  if (!v) { E.redraw(); return; }
  if (v.w === "all") E.change((x) => M.moveControl(x, hit.control, to), t("trc.dlg.sharedMoved"));
  else {
    let nid;
    E.change((x) => {
      const old = x.controls[hit.control];
      nid = M.addControl(x, old.kind, to);
      x.controls[nid].symbols = old.symbols.slice(); x.controls[nid].colF = old.colF;
      x.courseControls[hit.cc].control = nid;
      delete x.courseControls[hit.cc].number;
    }, t("trc.dlg.sharedNewDone"));
    E.select({ kind: "control", control: nid, cc: hit.cc });
  }
}
export async function conflict(E, info) {
  const who = info?.by || t("trc.dlg.anotherMember");
  const v = await modal(E, { title: t("trc.dlg.conflictTitle"), body: `<p>${esc(info?.at ? t("trc.dlg.conflictAt", { who, time: new Date(info.at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) }) : t("trc.dlg.conflict", { who }))}</p>
    <label class="tr-check"><input type="radio" name="w" value="reload" checked> ${esc(t("trc.dlg.conflictReload"))}</label>
    <label class="tr-check"><input type="radio" name="w" value="mine"> ${esc(t("trc.dlg.conflictMine"))}</label>`, cancel: null });
  if (!v) return;
  if (v.w === "reload") {
    const r = await S.loadJson(E.meta.id, "event", E.key);
    if (r) { E.ev = r.data; E.version = r.version; E.dirty = false; E.undo = []; E.redo = []; E.refresh(); E.status(t("trc.dlg.teamReloaded"), "ok"); }
  } else {
    const r = await S.loadJson(E.meta.id, "event", E.key);
    if (r) await S.saveVersion(E.meta.id, r.data, E.key, t("trc.dlg.versionReplaced", { who: info?.by || t("trc.dlg.theTeam") }), A.summaryOf(r.data)).catch(() => {});
    E.version = info?.version ?? E.version;
    await E.saveNow(true);
  }
}

// ---- files -----------------------------------------------------------------------------------------------------------------
export function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
/**
 * Several files at once: written into a folder the user picks (Chrome, Edge: the File System Access API), or one zip. The
 * choice is asked once and kept (Affichage's preferences, « ocn.tr.prefs » saveTo). files: { name: Uint8Array | string }.
 */
export async function saveFiles(E, files, zipName) {
  const names = Object.keys(files);
  if (!names.length) return;
  if (names.length === 1) { download(names[0], files[names[0]], "application/octet-stream"); return; }
  let how = "zip";
  if (typeof window.showDirectoryPicker === "function") {
    let pref = null;
    try { pref = JSON.parse(localStorage.getItem("ocn.tr.prefs") || "{}").saveTo || null; } catch (e) { /* none */ }
    if (!pref) {
      const v = await modal(E, { title: tn("trc.dlg.nFiles", names.length), ok: t("trc.dlg.save"), body: `
        <label class="tr-check"><input type="radio" name="how" value="folder" checked> ${esc(t("trc.dlg.filesToFolder"))}</label>
        <label class="tr-check"><input type="radio" name="how" value="zip"> ${esc(t("trc.dlg.filesToZip"))}</label>
        <label class="tr-check"><input type="checkbox" name="keep" checked> ${esc(t("trc.dlg.filesKeep"))}</label>` });
      if (!v) return;
      pref = v.how;
      if (v.keep) { try { const o = JSON.parse(localStorage.getItem("ocn.tr.prefs") || "{}"); o.saveTo = pref; localStorage.setItem("ocn.tr.prefs", JSON.stringify(o)); } catch (e) { /* this time only */ } }
    }
    how = pref;
  }
  if (how === "folder") {
    try {
      const dir = await window.showDirectoryPicker({ id: "ocn-tracer", mode: "readwrite" });
      for (const n of names) {
        const fh = await dir.getFileHandle(n, { create: true }), w = await fh.createWritable();
        await w.write(files[n]); await w.close();
      }
      E.toast(tn("trc.dlg.filesWritten", names.length, { dir: dir.name }), 5000);
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
      E.toast(t("trc.dlg.folderFailed"));
    }
  }
  const { zip } = await import("./pdf.js");
  const enc = new TextEncoder(), bin = {};
  for (const n of names) bin[n] = typeof files[n] === "string" ? enc.encode(files[n]) : files[n];
  download(zipName, new Blob([await zip(bin)], { type: "application/zip" }));
}
export const fileName = (s) => String(s || t("trc.dlg.defaultFile")).replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
/** The event as an Ozimut file (.ozmt, ocnfile.js): the whole event in one file, the map in it by default. */
async function exportOcn(E) {
  // the stored map's own name (a .ppen's map name can be another file's: an OCAD map replaced by its PDF), with an extension
  const ext = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp", "image/tiff": ".tif", "image/bmp": ".bmp", "application/pdf": ".pdf" };
  const mapName = (type) => { const n = String(E.meta.map?.name || E.ev.map.file || t("trc.dlg.defaultMap")).split(/[\\/]/).pop(); return /\.[a-z0-9]{2,5}$/i.test(n) ? n : n + (ext[type] || ""); };
  const v = await modal(E, { title: t("trc.dlg.exportOcn"), ok: t("trc.dlg.export"), remember: "exportOcn", body: `<p>${t("trc.dlg.exportOcnIntro")}</p>
    <label class="tr-check"><input type="checkbox" name="withMap" checked> ${esc(t("trc.dlg.includeMap", { name: mapName(E.meta.map?.type) }))}</label>
    ${E.key ? `<p class="tr-hint">${esc(t("trc.dlg.exportOcnPlain"))}</p>` : ""}` });
  if (!v) return;
  let map = null;
  if (v.withMap) {
    const r = await S.loadMap(E.meta.id, E.key).catch(() => null);
    if (r?.bytes) map = { name: mapName(r.type || E.meta.map?.type), type: r.type || E.meta.map?.type || "", bytes: r.bytes };
    else E.toast(t("trc.dlg.mapUnread"), 6000);
  }
  // the event's other maps (the advanced level) go with it
  const extra = [];
  if (v.withMap) for (const [id, m] of Object.entries(E.ev.maps || {})) {
    const r = await S.loadExtraMap(E.meta.id, id, E.key).catch(() => null);
    if (r?.bytes) extra.push({ id: Number(id), name: m.map.file || `map-${id}`, type: r.type || "", bytes: r.bytes });
  }
  // the event's elevation model goes with it (relief.js): the one kept with the event, else the one in hand
  let dem = await S.loadDem(E.meta.id, E.key).catch(() => null);
  if (!dem && E.relief) dem = await (await import("./relief.js")).pack(E.relief).catch(() => null);
  download(`${fileName(E.ev.title)}${OCN_EXT}`, await writeOcn(M.clone(E.ev), { map, extra, dem }), "application/zip");
  E.toast(map ? t("trc.dlg.ocnExportedMap") : t("trc.dlg.ocnExported"));
}
async function exportPpen(E) {
  // the advanced level's data has no place in a .ppen: said first, left out of the file (ppen.js ppenLosses)
  const losses = ppenLosses(E.ev);
  if (losses.length) {
    const v = await modal(E, { title: t("trc.dlg.ppenLossTitle"), ok: t("trc.dlg.ppenLossOk"), body: `<p>${esc(t("trc.dlg.ppenLossIntro"))}</p>
      <ul>${losses.map((l) => `<li>${esc(tn(`trc.pp.${l.key}`, l.n))}</li>`).join("")}</ul><p class="tr-hint">${esc(t("trc.dlg.ppenLossHint"))}</p>` });
    if (!v) return;
  }
  download(`${fileName(E.ev.title)}.ppen`, writePpen(E.ev), "application/xml");
  E.toast(t("trc.dlg.ppenSaved", { map: E.ev.map.file || t("trc.dlg.mapPlaceholder") }), 7000);
}
export async function importPpen(E, preset = null) {
  let file = preset;
  const v = await modal(E, { title: t("trc.dlg.importPpen"), body: `${dropHtml("tr-ip-drop", t("trc.dlg.ppenDrop"), ".ppen,.xml", false)}
    <p class="tr-hint" id="tr-ip-file">${esc(file ? t("trc.dlg.fileChosen", { name: file.name }) : t("trc.dlg.noFile"))}</p>
    <p>${esc(t("trc.dlg.ppenReplaces"))}</p>
    <label class="tr-check"><input type="checkbox" name="calage"> ${esc(t("trc.dlg.ppenCalage"))}</label>`,
  onOpen: (f) => dropZone(f.querySelector("#tr-ip-drop"), (list) => {
    const p = list.find((x) => /\.(ppen|xml)$/i.test(x.name));
    f.querySelector("#tr-ip-file").textContent = p ? t("trc.dlg.fileChosen", { name: p.name }) : t("trc.dlg.notPpen", { name: list[0].name });
    if (p) file = p;
  }),
  validate: () => (!file ? t("trc.dlg.ppenNeeded") : null), ok: t("trc.dlg.import") });
  if (!v) return;
  try {
    const imported = readPpen(await file.text());
    // both on an OCAD or Mapper map: the .ppen's positions are the map file's own mm (Purple Pen), the Tracer's are moved
    if (E.ev.map.kind === "ocad" && imported.map.kind === "ocad") M.shiftToFile({ ...imported, map: E.ev.map }, -1);
    E.change((x) => {
      const keep = { map: x.map, title: x.title };
      for (const k of Object.keys(x)) delete x[k];
      Object.assign(x, imported);
      x.map = { ...imported.map, ...keep.map, scale: imported.map.scale || keep.map.scale, dpi: keep.map.kind === "bitmap" ? (imported.map.dpi || keep.map.dpi) : keep.map.dpi };
      if (keep.map.kind === "bitmap" && imported.map.dpi && imported.map.dpi !== keep.map.dpi) { x.map.w = keep.map.w * keep.map.dpi / imported.map.dpi; x.map.h = keep.map.h * keep.map.dpi / imported.map.dpi; }
      if (!x.title) x.title = keep.title;
    }, t("trc.dlg.ppenImport"));
    E.setCourse(M.courseIds(E.ev)[0] || 0); E.fitCourse();
    E.toast(t("trc.dlg.imported", { courses: tn("trc.dlg.nCourses", Object.keys(E.ev.courses).length), controls: tn("trc.dlg.nControls", Object.keys(E.ev.controls).length) }));
    if (v.calage) (await import("./calage.js")).calage(E, { fromPpen: true });
  } catch (err) { E.toast(t("trc.dlg.ppenUnreadable")); }
}

// ---- team, versions, encryption ----------------------------------------------------------------------------------------------
async function team(E) {
  const meta = E.meta;
  const owner = E.role === "owner" || E.role === "setter";
  const rows = (meta.team || []).map((m) => ({ ...m }));
  const roles = [["setter", t("trc.dlg.roleSetter")], ["controller", t("trc.dlg.roleController")], ["viewer", t("trc.dlg.roleViewer")]];
  const roleName = (r) => roles.find(([k]) => k === r)?.[1] || r;
  // the club groups (docs/clubs/design.md §1): « les organisateurs du club » on the team (../clubgroups.js; loaded here, not
  // with the editor, so that the Tracer offline never needs it)
  const CG = owner ? await import("../clubgroups.js").catch(() => null) : null;
  const groupsHtml = CG ? await CG.groupsBlock(meta.orgGroups, "organiser").catch(() => "") : "";
  let groups;
  const render = (box) => {
    box.innerHTML = `<table class="tr-table"><thead><tr><th>${esc(t("trc.dlg.member"))}</th><th>${esc(t("trc.dlg.role"))}</th><th></th></tr></thead><tbody>
      <tr><td>${esc(meta.ownerName)}${meta.ownerLic ? ` <small>(${esc(meta.ownerLic)})</small>` : ""}</td><td>${esc(t("trc.dlg.creator"))}</td><td></td></tr>
      ${rows.map((m, i) => `<tr><td>${esc(m.name || "?")}${m.lic ? ` <small>(${esc(m.lic)})</small>` : ""}</td><td>${owner ? sel(`r${i}`, roles, m.role) : esc(roleName(m.role))}
        ${owner ? `<label class="tr-check tr-lent" title="${esc(t("trc.dlg.lentTip"))}"><input type="checkbox" data-lent="${i}" ${m.lent ? "checked" : ""}> ${esc(t("trc.dlg.lent"))}</label>` : m.lent ? ` <small>${esc(t("trc.dlg.lent"))}</small>` : ""}</td>
      <td>${owner ? `<button type="button" class="btn btn-sm" data-rm="${i}">${esc(t("trc.dlg.remove"))}</button>` : ""}</td></tr>`).join("")}</tbody></table>`;
    box.querySelectorAll("[data-rm]").forEach((b) => b.addEventListener("click", () => { rows.splice(Number(b.dataset.rm), 1); render(box); }));
    box.querySelectorAll("select").forEach((s2) => s2.addEventListener("change", () => { rows[Number(s2.name.slice(1))].role = s2.value; }));
    box.querySelectorAll("[data-lent]").forEach((c) => c.addEventListener("change", () => { rows[Number(c.dataset.lent)].lent = c.checked; }));
  };
  const v = await modal(E, { title: t("trc.dlg.team"), wide: true, ok: owner ? t("trc.dlg.save") : t("trc.dlg.close"), cancel: owner ? t("trc.dlg.cancel") : null, body: `
    <p>${esc(t("trc.dlg.teamIntro"))}</p>
    <div id="tr-team"></div>
    ${groupsHtml}
    ${owner ? `<h3>${esc(t("trc.dlg.invite"))}</h3><p><small>${esc(t("trc.dlg.inviteHint"))}</small></p>
      <div class="tr-row">${field(t("trc.dlg.role"), sel("inv-role", roles, "controller"))}<label class="tr-check" title="${esc(t("trc.dlg.lentTip"))}"><input type="checkbox" name="inv-lent"> ${esc(t("trc.dlg.lent"))}</label>
        <button type="button" class="btn btn-sm" id="tr-invite">${esc(t("trc.dlg.inviteMake"))}</button></div>
      <p><small>${esc(t("trc.dlg.lentNote"))}</small></p>
      <div id="tr-new-link"></div><div id="tr-links"></div>` : ""}`,
  onOpen: (f) => {
    const box = f.querySelector("#tr-team");
    render(box);
    if (CG && groupsHtml) { groups = CG.readGroups(f); f.addEventListener("change", () => { groups = CG.readGroups(f); }); }
    // invitation links (owner, 2026-10-20: the one way to join, for everyone): made for a role, passed on by hand, revocable
    const links = f.querySelector("#tr-links");
    const linkOf = (token) => `${location.origin}/#/orga-tracer?id=${encodeURIComponent(meta.id)}&invite=${encodeURIComponent(token)}`;
    const until = (ms) => new Date(ms).toLocaleDateString(locale(), { day: "numeric", month: "short" });
    const drawLinks = async () => {
      if (!links) return;
      const r = await S.api(`/${meta.id}/invites`).catch(() => null);
      const list = r?.invites || [];
      links.innerHTML = list.length ? `<table class="tr-table"><thead><tr><th>${esc(t("trc.dlg.inviteCol"))}</th><th>${esc(t("trc.dlg.role"))}</th><th>${esc(t("trc.dlg.inviteUntil"))}</th><th></th></tr></thead><tbody>
        ${list.map((x) => `<tr><td>#${x.n}${x.by ? ` <small>${esc(t("trc.dlg.inviteBy", { name: x.by }))}</small>` : ""}</td><td>${esc(roleName(x.role))}</td><td>${esc(until(x.expires))}</td>
          <td><button type="button" class="btn btn-sm" data-revoke="${x.n}">${esc(t("trc.dlg.inviteRevoke"))}</button></td></tr>`).join("")}</tbody></table>` : "";
      links.querySelectorAll("[data-revoke]").forEach((b) => b.addEventListener("click", async () => {
        b.disabled = true;
        await S.api(`/${meta.id}/invites?n=${encodeURIComponent(b.dataset.revoke)}`, { method: "DELETE" }).catch(() => null);
        drawLinks();
      }));
    };
    drawLinks();
    f.querySelector("#tr-invite")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      const r = await S.api(`/${meta.id}/invites`, { method: "POST", body: { role: f.querySelector('[name="inv-role"]').value, lent: !!f.querySelector('[name="inv-lent"]')?.checked } }).catch((err) => ({ error: err.code || "x" }));
      e.target.disabled = false;
      const box = f.querySelector("#tr-new-link");
      if (!r?.token) { E.toast(t(r?.error === "too many invites" ? "trc.dlg.inviteTooMany" : "trc.dlg.inviteFailed")); return; }
      const url = linkOf(r.token);
      box.innerHTML = `<div class="tr-row"><input id="tr-link" readonly size="44" value="${esc(url)}"><button type="button" class="btn btn-sm" id="tr-copy">${esc(t("trc.dlg.inviteCopy"))}</button></div>
        <p><small>${esc(t("trc.dlg.inviteOnce", { role: roleName(r.role), date: until(r.expires) }))}${meta.encrypted ? ` ${esc(t("trc.dlg.inviteEncrypted"))}` : ""}</small></p>`;
      box.querySelector("#tr-copy").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(url); E.toast(t("trc.dlg.inviteCopied")); } catch (err) { box.querySelector("#tr-link").select(); }
      });
      drawLinks();
    });
  } });
  if (!v || !owner) return;
  const r = await S.api(`/${meta.id}`, { method: "PUT", body: { team: rows.map((m) => (m.uid ? { uid: m.uid, role: m.role, lent: !!m.lent } : { lic: m.lic, role: m.role, lent: !!m.lent })),
    ...(groups !== undefined ? { orgGroups: groups } : {}) } });
  E.meta = r.event;
  E.toast(t("trc.dlg.teamSaved"));
}
async function versionSave(E) {
  const v = await modal(E, { title: t("trc.dlg.versionSave"), body: field(t("trc.dlg.versionNote"), `<input name="note" maxlength="280" placeholder="${esc(t("trc.dlg.versionNoteExample"))}">`) });
  if (!v) return;
  await E.saveNow(true);
  await S.saveVersion(E.meta.id, E.ev, E.key, v.note.trim(), A.summaryOf(E.ev));
  E.toast(t("trc.dlg.versionSaved"));
}
async function versions(E) {
  const r = await S.api(`/${E.meta.id}/versions`);
  const list = r.versions || [];
  const v = await modal(E, { title: t("trc.dlg.versions"), wide: true, ok: null, cancel: t("trc.dlg.close"), body: list.length ? `<div class="table-wrap"><table class="tr-table"><thead><tr><th>${esc(t("trc.dlg.colDate"))}</th><th>${esc(t("trc.dlg.colBy"))}</th><th>${esc(t("trc.dlg.colNote"))}</th><th>${esc(t("trc.dlg.colContent"))}</th><th></th></tr></thead><tbody>
    ${list.map((x) => `<tr><td class="num">${new Date(x.at).toLocaleString(locale(), { dateStyle: "short", timeStyle: "short" })}</td><td>${esc(x.by)}</td><td>${esc(x.note)}</td><td><small>${esc(x.summary)}</small></td>
    <td><button type="button" class="btn btn-sm" data-diff="${x.n}">${esc(t("trc.dlg.differences"))}</button> <button type="button" class="btn btn-sm" data-restore="${x.n}">${esc(t("trc.dlg.restore"))}</button></td></tr>`).join("")}</tbody></table></div><div id="tr-diff"></div>`
    : `<p>${t("trc.dlg.noVersions", { where: where("version-save") })}</p>`,
  onOpen: (f, done) => {
    f.querySelectorAll("[data-diff]").forEach((b) => b.addEventListener("click", async () => {
      const old = await S.loadVersion(E.meta.id, b.dataset.diff, E.key);
      f.querySelector("#tr-diff").innerHTML = `<h3>${esc(t("trc.dlg.sinceVersion"))}</h3><ul>${(await import("./extras.js")).diff(old, E.ev).map((x) => `<li>${esc(x)}</li>`).join("") || `<li>${esc(t("trc.dlg.noDifference"))}</li>`}</ul>`;
    }));
    f.querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", async () => {
      if (E.readOnly) { E.toast(t("trc.dlg.readOnly")); return; }
      const old = await S.loadVersion(E.meta.id, b.dataset.restore, E.key);
      if (!old) return;
      done(null);
      E.change((x) => { for (const k of Object.keys(x)) delete x[k]; Object.assign(x, old); }, t("trc.dlg.versionRestored"));
      E.toast(t("trc.dlg.versionRestoredUndo"));
    }));
  } });
  void v;
}
async function encryption(E) {
  const on = !!E.meta.encrypted, owner = E.role === "owner";
  if (!owner) { E.toast(on ? t("trc.dlg.encOwnerOnly") : t("trc.dlg.encCreatorOnly")); return; }
  const v = await modal(E, { title: t("trc.dlg.encryption"), wide: true, ok: on ? t("trc.dlg.encRemove") : t("trc.dlg.encrypt"), body: on
    ? `<p>${esc(t("trc.dlg.encOnIntro"))}</p>`
    : `<p>${t("trc.dlg.encOffIntro")}</p>
      ${field(t("trc.dlg.passphrase"), '<input name="p1" type="password" autocomplete="new-password">')}${field(t("trc.dlg.passphraseAgain"), '<input name="p2" type="password" autocomplete="new-password">')}`,
  validate: (o) => (on ? null : o.p1.length < 12 ? t("trc.dlg.passphraseShort") : o.p1 !== o.p2 ? t("trc.dlg.passphraseDiffer") : null) });
  if (!v) return;
  E.status(t("trc.dlg.encrypting"), "busy");
  const map = await S.loadMap(E.meta.id, E.key);
  const comments = await S.loadJson(E.meta.id, "comments", E.key).catch(() => null);
  let key = null, setting = null;
  if (!on) ({ key, setting } = await S.newEncryption(v.p1));
  if (map) await S.saveMap(E.meta.id, map.bytes, E.meta.map?.type || map.type, key);
  if (comments) await S.saveJson(E.meta.id, "comments", comments.data, key);
  // the versions are written again under the new setting, and the old copies removed
  const list = (await S.api(`/${E.meta.id}/versions`).catch(() => ({ versions: [] }))).versions || [];
  const old = [];
  for (const x of list.slice().reverse()) { const data = await S.loadVersion(E.meta.id, x.n, E.key).catch(() => null); if (data) old.push([x, data]); }
  let first = null;
  for (const [x, data] of old) { const w = await S.saveVersion(E.meta.id, data, key, x.note, x.summary); if (first == null) first = w.n; }
  if (first != null) await S.api(`/${E.meta.id}/versions?below=${first}`, { method: "DELETE" }).catch(() => {});
  E.key = key; S.setKey(E.meta.id, key);
  const r = await S.api(`/${E.meta.id}`, { method: "PUT", body: { encrypted: setting } });
  E.meta = r.event;
  E.dirty = true; await E.saveNow(true);
  E.toast(on ? t("trc.dlg.encRemoved") : t("trc.dlg.encDone"), 7000);
}
export { field, sel, num, symbolName };
