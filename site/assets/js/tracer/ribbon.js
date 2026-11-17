// The Tracer's ribbon — its one interface (owner, 2026-10-17; the Purple Pen menus retired on 2026-10-24). Drawn from
// ribbon-data.js: tabs in the order of the setter's work, contextual tabs that come with the selection (a control, a leg, an
// object, a shape being drawn) and hold what applies to it, the « Fichier » menu (its lists in dialogs), a quick-access bar, a command
// search (Alt+Q), key hints (Alt), live figures (the event audit's problems, open comments, the course's length and climb),
// settings in place (print scale, standards, sizes, the purple's blend, a leg's flagging), tooltips that say what a command
// does and why it is greyed. The advanced level's items (ribbon-data.js isPro) are drawn for administrators only (E.pro). The ribbon shrinks with the window (groups fold into one
// button each), can be a single line or only its tabs (Ctrl+F1; by default only its tabs in full window and one line on a short
// screen). The arrow keys move through the tabs and the buttons (one Tab stop each). The quick-access bar of the title bar is
// each user's (QAT_DEFAULT: what a setter is likely to use most; its ▾, or a right-click on any button, changes it). Every command
// goes through the editor's own actions (dialogs.js action, the tools of editor.js), as the menus do; the contextual tabs and the
// right-click menu share what applies to the selection (context.js).

import * as M from "./model.js";
import * as S from "./store.js";
import * as D from "./dialogs.js";
import * as A from "./actions.js";
import { svg, ACT_ICON } from "./icons.js";
import { TABS, CONTEXT, BACKSTAGE, GALLERY, INFO, QAT_DEFAULT, QAT_CHOICES, commands, isPro } from "./ribbon-data.js";
import { ctxKind, applies as appliesTo } from "./context.js";
import { PAGES, MAIN_PAGES, pageOf } from "./pdf.js";
import * as FW from "../fullwin.js";
import { hasGeo } from "./geo.js";
import { mapColors, defaultLayer } from "./appear.js";
import { t, tn, locale } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nf = (v, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const km = (m) => `${nf(m / 1000, 1)} km`;
const today = () => new Date().toISOString().slice(0, 10);
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const PREF = "ocn.tr.prefs";
const loadPref = (k, d) => { try { const v = JSON.parse(localStorage.getItem(PREF) || "{}")[k]; return v ?? d; } catch (e) { return d; } };
const savePref = (k, v) => { try { const o = JSON.parse(localStorage.getItem(PREF) || "{}"); o[k] = v; localStorage.setItem(PREF, JSON.stringify(o)); } catch (e) { /* this visit */ } };
const GUIDE = (ch) => `#/documentation?module=orga&onglet=tracer${ch ? `&voir=${ch}` : ""}`;
// the commands that need a point on the map: the ribbon asks for the click
const PICK = {
  "gap-add-circle": t("trc.rib.pickGapCircle"), "bend-add": t("trc.rib.pickBendAdd"),
  "gap-add-leg": t("trc.rib.pickGapLeg"), "bend-remove": t("trc.rib.pickBendRemove"),
  "gap-remove-leg": t("trc.rib.pickGapRemove"), "corner-add": t("trc.rib.pickCornerAdd"),
  "corner-remove": t("trc.rib.pickCornerRemove"),
};
const BLENDS = [["none", t("trc.rib.blendNone"), t("trc.rib.blendNoneTip")], ["blend", t("trc.rib.blendBlend"), t("trc.rib.blendBlendTip")],
  ["layer", t("trc.rib.blendLayer"), t("trc.rib.blendLayerTip")]];
const FLAGS = [["none", t("trc.rib.flagNone")], ["all", t("trc.rib.flagAll")], ["begin", t("trc.rib.flagBegin")], ["end", t("trc.rib.flagEnd")]];
const SCALES = [4000, 5000, 7500, 10000, 12500, 15000];

/** Mount the ribbon in the editor (its root has #tr-ribbon and the title bar's #tr-rsearch, #tr-rdisplay). */
export function mountRibbon(E) {
  const host = E.$("#tr-ribbon");
  const R = { tab: "home", prevTab: "home", ctx: null, ctxKey: null, floating: false, pulse: false,
    issues: null, issueRows: [], comments: null, items: [], keytips: 0, pops: [] };
  /** The display: the user's choice for the page or for full window, else « auto » — only the tabs in full window (the map has
   *  the screen), one line under 800 px of height (a laptop), the whole ribbon otherwise. */
  const dispKey = () => (FW.isFull() ? "ribbonFw" : "ribbon");
  const chosen = (where = dispKey()) => { const v = loadPref(where, null); return ["full", "line", "folded"].includes(v) ? v : null; };
  const wanted = () => chosen() || (FW.isFull() ? "folded" : window.innerHeight < 800 ? "line" : "full");
  E.ribbon = R;

  // ---- what a command can do now -----------------------------------------------------------------------------------------
  const course = () => E.course();
  const ctl = () => (E.sel?.control ? E.ev.controls[E.sel.control] : null);
  const cc = () => (E.sel?.cc ? E.ev.courseControls[E.sel.cc] : null);
  const special = () => (E.sel?.kind === "special" ? E.ev.specials[E.sel.id] : null);
  const raceLater = () => E.meta?.kind === "race" && E.meta.date && E.meta.date > today();
  /** null when the command can run, else why not (shown in its tooltip). */
  function why(it) {
    const act = it.act || it.tool;
    if (E.blank && !["view-course", "view-map", "save-to"].includes(act)) return t("trc.rib.whyBlank");
    const n = it.need;
    if ((n === "edit" || n === "course" || n === "vector" || (it.tool && it.tool !== "select")) && E.readOnly) return t("trc.rib.readOnly");
    if (n === "course" && !E.cd.course) return t("trc.rib.whyCourse");
    if (n === "vector" && E.map?.kind !== "vector") return t("trc.rib.whyVector");
    if (n === "after" && raceLater()) return t("trc.rib.whyAfter", { date: new Date(E.meta.date).toLocaleDateString(locale()) });
    if ((act === "var-fork" || act === "var-loop" || act === "var-delete") && !E.sel?.cc && it.t !== "small") return E.cd.course ? t("trc.rib.whyVarControl") : t("trc.rib.whyVarCourse");
    if (act === "pdf-course" && !E.cd.course) return t("trc.rib.whyPdfCourse");
    return null;
  }
  function labelOf(it) {
    const c = ctl(), sp = special();
    if (it.act === "delete" && R.ctx === "control") return E.cd.course && E.sel?.cc ? t("trc.rib.removeFromCourse") : t("trc.rib.deleteControl");
    if (it.act === "special-props" && sp) return sp.kind === "text" ? t("trc.rib.spText") : sp.kind === "descriptions" ? t("trc.rib.spColumns") : sp.kind === "inset" ? t("trc.rib.spInset") : t("trc.rib.spAppearance");
    if (it.act === "toggle-exchange" && cc()?.exchange) return t("trc.rib.removeExchange");
    if (it.count === "unused" && !E.blank) { const n = M.unusedControls(E.ev).length; return n ? `${it.label} (${n})` : it.label; }
    void c;
    return it.label;
  }
  function pressed(it) {
    if (it.tool) return E.tool === it.tool || (it.tool.startsWith("special:") && E.tool === it.tool);
    switch (it.toggle) {
      case "printArea": return !!E.opts.printArea;
      case "allControls": return !!E.opts.allControls;
      case "overprint": return !!E.ev.appearance?.ocadOverprint;
      case "exchange": return !!cc()?.exchange;
      case "flip": return !!cc()?.flip;
      case "rnd": return !!cc()?.rnd;
      case "lock": return !!ctl()?.locked;
      case "angles": return E.overlays.some((f) => f.key === "angles");
      case "nearest": return E.overlays.some((f) => f.key === "nearest");
      case "routes": return !!E.ra?.panel;
      case "backdrop": return !!E.backdrop?.panel;
      case "autoDesc": return !!E.opts.autoDesc;
      default: return null;
    }
  }
  const badgeOf = (k) => (k === "issues" ? R.issues : k === "comments" ? R.comments : null);
  // red for problems, amber for reminders only (a climb not filled in) and for comments
  const softBadge = (k) => k === "comments" || (k === "issues" && R.issuesSoft);
  // on a phone the full ribbon becomes its single line
  const disp = () => (wanted() === "full" && window.innerWidth <= 760 ? "line" : wanted());

  // ---- drawing -----------------------------------------------------------------------------------------------------------
  /** The advanced level's items, groups and tabs: drawn for administrators only (owner, 2026-10-24). */
  const shown = (it) => E.pro || !isPro(it);
  const tabs = () => TABS.filter(shown);
  function curTab() { return R.tab.startsWith("ctx:") ? CONTEXT[R.tab.slice(4)] : tabs().find((t) => t.id === R.tab); }
  function curGroups() {
    const t = curTab();
    if (!t) return [];
    const ctx = R.tab.startsWith("ctx:");
    // the advanced level's items left out for the others; contextual: the items that apply to the selection only; the groups left with something
    const keep = (items) => items.filter(shown).map((it) => (it.t === "stack" ? { ...it, items: keep(it.items) } : it))
      .filter((it) => (it.t === "stack" ? it.items.length : !ctx || !it.act || appliesTo(E, it.act, R.ctx)));
    return t.groups.filter(shown).map((g) => ({ ...g, items: keep(g.items) })).filter((g) => g.items.length);
  }
  const reg = (it, extra = {}) => { R.items.push({ ...it, ...extra }); return R.items.length - 1; };
  function button(it, size) {
    const w = why(it), p = pressed(it), label = labelOf(it), i = reg(it, { label, why: w });
    const b = it.badge ? badgeOf(it.badge) : null;
    const attrs = `type="button" data-ri="${i}" ${it.act ? `data-ract="${esc(it.act)}"` : `data-rtool="${esc(it.tool)}"`} ${w ? 'aria-disabled="true"' : ""} ${p != null ? `aria-pressed="${p}"` : ""} ${isPro(it) ? 'data-pro="1"' : ""}`;
    const badge = b ? `<span class="tr-rbadge${softBadge(it.badge) ? " soft" : ""}">${b}</span>` : "";
    if (size === "big") {
      const caret = it.split ? `<span class="tr-rsplit" data-rsplit="${i}" role="button" aria-label="${esc(t("trc.rib.moreChoices"))}" title="${esc(t("trc.rib.moreChoices"))}">▾</span>` : "";
      return `<button class="tr-rbig${it.split ? " has-split" : ""}" ${attrs}>${svg(it.icon, 26)}<span class="tr-rl">${esc(label)}</span>${caret}${badge}</button>`;
    }
    return `<button class="tr-rsmall" ${attrs}>${svg(it.icon, 16)}<span class="tr-rl">${esc(label)}</span>${it.key && it.key.length === 1 ? `<kbd class="tr-rkey">${esc(it.key)}</kbd>` : ""}${it.split ? '<span class="tr-rcaret">▾</span>' : ""}${badge}</button>`;
  }
  function itemHtml(it, mode) {
    if (it.t === "stack") return mode === "line" ? it.items.map((x) => itemHtml(x, mode)).join("") : `<div class="tr-rstack">${it.items.map((x) => itemHtml(x, mode)).join("")}</div>`;
    if (it.t === "big") return button(it, mode === "line" ? "small" : "big");
    if (it.t === "small") return button(it, "small");
    if (it.t === "gallery") return gallery(mode);
    if (it.t === "field") return fieldHtml(it.id, mode);
    if (it.t === "chip") return chipHtml(it.id, mode);
    if (it.t === "modes") return modesHtml(it.id, mode);
    return "";
  }
  function gallery(mode) {
    const list = mode === "line" ? GALLERY.slice(0, 4) : GALLERY;
    const cell = (k) => {
      const it = { t: "small", tool: `special:${k}`, label: A.SPECIAL_NAME[k], icon: ACT_OF[k] || k, need: "edit", tip: SPECIAL_TIP(k) };
      const w = why(it), i = reg(it, { why: w });
      return `<button type="button" class="tr-rcell" data-ri="${i}" data-rtool="special:${k}" ${w ? 'aria-disabled="true"' : ""} aria-pressed="${E.tool === `special:${k}`}" aria-label="${esc(it.label)}">${svg(it.icon, 18)}</button>`;
    };
    const more = { t: "small", act: "special-more", label: t("trc.rib.allSpecials"), icon: "special", tip: t("trc.rib.allSpecialsTip") };
    const mw = why({ ...more, need: "edit" }), mi = reg(more, { why: mw });
    return `<div class="tr-rgallery${mode === "line" ? " line" : ""}">${list.map(cell).join("")}<button type="button" class="tr-rmore" data-ri="${mi}" data-ract="special-more" ${mw ? 'aria-disabled="true"' : ""} aria-label="${esc(t("trc.rib.allSpecials"))}">▾</button></div>`;
  }
  // ---- settings in the ribbon (their names and tooltips: ribbon-data.js INFO.field) ---------------------------------------------
  const FIELDS = {
    descStandard: { opts: () => D.DESC_STANDARDS.map(([k, l]) => [k, l.replace(/ \(.*/, "")]), get: () => E.ev.descStandard,
      set: (v) => D.applyStandards(E, v, E.ev.appearance.mapStandard) },
    lang: { opts: () => D.langChoices(E.ev.lang), get: () => E.ev.lang,
      set: async (v) => { if (!["fr", "en"].includes(v)) await (await import("./symbols.js")).loadAllTexts(); E.change((x) => { x.lang = v; }, t("trc.rib.undoLang")); } },
    mapStandard: {
      opts: () => [["2017", "ISOM 2017"], ["Spr2019", "ISSprOM 2019"], ["Ski2019", "ISSkiOM 2019"], ["Mtbo2022", "ISMTBOM 2022"], ["2000", "ISOM 2000"]], get: () => E.ev.appearance.mapStandard, set: (v) => D.applyStandards(E, E.ev.descStandard, v) },
    printScale: {
      opts: () => { const cur = course() ? course().printScale : E.ev.allControls.printScale; return [...new Set([...SCALES, E.ev.map.scale, cur])].filter((x) => x > 0).sort((a, b) => a - b).map((x) => [String(x), `1:${nf(x)}`]); },
      get: () => String(course() ? course().printScale : E.ev.allControls.printScale),
      set: (v) => { const id = E.cd.course, k = Number(v); E.change((x) => { if (id) x.courses[id].printScale = k; else x.allControls.printScale = k; }, t("trc.rib.undoPrintScale")); } },
    paper: { opts: () => {
        const out = [];
        // the usual papers, and the course's own when it is another (set in « Zone d'impression »)
        const pg0 = pageOf(M.printAreaOf(E.ev, E.cdDraw || E.cd) || M.DEFAULT_PRINT_AREA());
        const own = Object.entries(PAGES).find(([, [w, h]]) => Math.abs(w - Math.min(pg0.w, pg0.h)) < 1 && Math.abs(h - Math.max(pg0.w, pg0.h)) < 1)?.[0];
        for (const p of [...MAIN_PAGES, ...(own && !MAIN_PAGES.includes(own) ? [own] : [])]) out.push([`${p}:portrait`, t("trc.rib.paperPortrait", { p })], [`${p}:landscape`, t("trc.rib.paperLandscape", { p })], [`${p}:auto`, t("trc.rib.paperAuto", { p })]);
        return out;
      },
      get: () => {
        const pa = M.printAreaOf(E.ev, E.cdDraw || E.cd) || M.DEFAULT_PRINT_AREA(), page = pageOf(pa);
        const name = Object.entries(PAGES).find(([, [w, h]]) => Math.abs(w - Math.min(page.w, page.h)) < 1 && Math.abs(h - Math.max(page.w, page.h)) < 1)?.[0] || "A4";
        return `${name}:${pa.auto && !pa.restrictOrientation ? "auto" : pa.landscape ? "landscape" : "portrait"}`;
      },
      set: (v) => {
        const [p, o] = v.split(":"), [w, h] = PAGES[p] || PAGES.A4, cd = E.cd;
        const make = (old) => ({ ...M.DEFAULT_PRINT_AREA(), ...old, pageW: Math.round(w / 0.254), pageH: Math.round(h / 0.254), landscape: o === "landscape", restrictOrientation: o !== "auto" });
        E.change((x) => {
          if (!cd.course) x.printArea = make(x.printArea);
          else { const c = x.courses[cd.course]; if (cd.part >= 0) c.partAreas = { ...(c.partAreas || {}), [cd.part]: make(c.partAreas?.[cd.part] || c.printArea) }; else c.printArea = make(c.printArea); }
        }, t("trc.rib.undoPaper"));
      } },
    circle: { num: true, get: () => E.ev.appearance.controlCircleSize, set: (v) => E.change((x) => { x.appearance.controlCircleSize = v; }, t("trc.rib.undoCircle")) },
    line: { num: true, get: () => E.ev.appearance.lineWidth, set: (v) => E.change((x) => { x.appearance.lineWidth = v; }, t("trc.rib.undoLine")) },
    number: { num: true, get: () => E.ev.appearance.numberHeight, set: (v) => E.change((x) => { x.appearance.numberHeight = v; }, t("trc.rib.undoNumber")) },
    intensity: { range: true, get: () => E.opts.intensity,
      set: (v) => E.setIntensity(v) },
    code: { text: true, get: () => ctl()?.code || "", set: (v, el) => { if (!A.changeCode(E, E.sel.control, v) && el) el.value = ctl()?.code || ""; },
      show: () => ctl()?.kind === "normal" },
  };
  function fieldHtml(id, mode) {
    const f = FIELDS[id];
    if (!f || (f.show && !f.show())) return "";
    const dis = E.blank || (E.readOnly && id !== "intensity") ? "disabled" : "";
    f.label = INFO.field[id]?.[0] || id; f.tip = INFO.field[id]?.[1] || "";
    const i = reg({ t: "field", label: f.label, tip: f.tip, id });
    let ctl0;
    if (f.range) ctl0 = `<input type="range" min="0.2" max="1" step="0.05" value="${f.get()}" data-rfield="${id}" aria-label="${esc(f.label)}">`;
    else if (f.num) ctl0 = `<input type="number" min="0.3" max="3" step="0.05" value="${f.get()}" data-rfield="${id}" aria-label="${esc(f.label)}" ${dis}>`;
    else if (f.text) ctl0 = `<input type="text" maxlength="3" size="4" value="${esc(f.get())}" data-rfield="${id}" aria-label="${esc(f.label)}" ${dis}>`;
    else ctl0 = `<select data-rfield="${id}" aria-label="${esc(f.label)}" ${dis}>${f.opts().map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(f.get()) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    return `<label class="tr-rfield${mode === "line" ? " line" : ""}" data-ri="${i}"><span>${esc(f.label)}</span>${ctl0}</label>`;
  }
  // ---- live figures --------------------------------------------------------------------------------------------------------
  function chipHtml(id, mode) {
    const lines = chipLines(id);
    if (!lines.length) return "";
    if (mode === "line") return `<span class="tr-rchip line">${esc(lines[0])}</span>`;
    if (id === "issues") {
      const rows = R.issueRows.slice(0, 3);
      return `<div class="tr-rchip issues">${!R.checked ? `<span class="muted">${esc(t("trc.rib.checking"))}</span>` : rows.length ? rows.map((r) => `<button type="button" data-ract="rep-audit" class="tr-rissue"><i class="${r.warn ? "w" : ""}"></i>${esc(r.text)}</button>`).join("")
        + (R.issues > 3 ? `<span class="muted">${esc(tn("trc.rib.issuesMore", R.issues - 3))}</span>` : "") : `<span class="tr-rok">${esc(t("trc.rib.noProblem"))}</span>`}</div>`;
    }
    return `<div class="tr-rchip"><b>${esc(lines[0])}</b>${lines.slice(1).map((l) => `<span>${esc(l)}</span>`).join("")}</div>`;
  }
  function chipLines(id) {
    if (E.blank) return id === "issues" ? [] : [];
    const ev = E.ev;
    switch (id) {
      case "issues": return [t("trc.rib.audit")];
      case "mapInfo": {
        const m = E.map, sc = `1:${nf(ev.map.scale)}`;
        if (!m) return [t("trc.rib.noMap", { scale: sc })];
        return [m.kind === "vector" ? `${m.format === "oom" ? "Mapper" : `OCAD ${m.version || ""}`.trim()} · ${sc}` : m.kind === "pdf" ? `PDF · ${sc}` : t("trc.rib.imageDpi", { dpi: Math.round(ev.map.dpi || m.dpi || 0), scale: sc })];
      }
      case "geoInfo": return [hasGeo(ev) ? t("trc.rib.georefYes") : t("trc.rib.georefNo")];
      case "course": {
        const c = course();
        if (!c) return [t("trc.rib.allControls"), t("trc.rib.allControlsCount", { n: Object.values(ev.controls).filter((x) => x.kind === "normal").length, unused: M.unusedControls(ev).length })];
        const v = E.layout?.view;
        if (!v) return [c.name];
        const len = v.totalMin === v.totalMax ? km(v.totalMin) : `${km(v.totalMin)} – ${km(v.totalMax)}`;
        return [`${c.name} · ${len}${c.climb >= 0 ? ` · ${Math.round(c.climb)} m` : ""}`, t("trc.rib.courseControls", { n: v.minNormal === v.maxNormal ? v.minNormal : `${v.minNormal} – ${v.maxNormal}`, scale: nf(c.printScale) }),
          c.load >= 0 ? tn("trc.rib.competitorsExpected", c.load) : t("trc.rib.competitorsUnknown")];
      }
      case "control": {
        const c = ctl(); if (!c) return [];
        const used = M.coursesUsing(ev, E.sel.control).map((x) => ev.courses[x].name), load = M.controlLoad(ev, E.sel.control);
        let next = "";
        if (E.cd.course && E.sel.cc) { const v = E.layout?.view, i = v ? v.controls.findIndex((x) => x.ccs.includes(E.sel.cc)) : -1; if (i >= 0 && v.controls[i].legLen?.length) next = t("trc.rib.toNext", { m: nf(v.controls[i].legLen[0]) }); }
        return [used.length ? used.join(", ") : t("trc.rib.inNoCourse"), load >= 0 ? tn("trc.rib.competitors", load) : t("trc.rib.position", { x: nf(c.x, 1), y: nf(c.y, 1) }), ...(next ? [next] : [])];
      }
      case "leg": {
        const s = E.sel; if (s?.kind !== "leg" || !ev.controls[s.c1] || !ev.controls[s.c2]) return [];
        const a = ev.controls[s.c1], b = ev.controls[s.c2], len = M.legLengthM(ev, s.c1, s.c2), straight = M.mmToM(ev, M.dist([a.x, a.y], [b.x, b.y]));
        const used = M.coursesUsingLeg(ev, s.c1, s.c2).map((x) => ev.courses[x].name), load = M.legLoad(ev, s.c1, s.c2);
        return [`${a.code || t("trc.rib.start")} → ${b.code || t("trc.rib.finish")} · ${nf(len)} m${Math.abs(len - straight) > 1 ? ` ${t("trc.rib.straightLine", { m: nf(straight) })}` : ""}`, used.join(", ") || "—", ...(load >= 0 ? [tn("trc.rib.competitors", load)] : [])];
      }
      case "special": {
        const sp = special(); if (!sp) return [];
        const shown = sp.all ? t("trc.rib.onAllCourses") : t("trc.rib.shownOn", { list: sp.courses.map((x) => (x.course ? ev.courses[x.course]?.name : t("trc.rib.allControls"))).join(", ") || t("trc.rib.noCourse") });
        return [A.SPECIAL_NAME[sp.kind] || sp.kind, shown];
      }
      case "drawing": {
        const p = E.pending; if (!p) return [];
        const name = p.kind === "route" ? t("trc.rib.route") : A.SPECIAL_NAME[p.kind] || p.kind;
        return [tn("trc.rib.drawPoints", p.pts.length, { name }), p.kind === "route" ? t("trc.rib.drawRouteHint") : t("trc.rib.drawCornersHint"), t("trc.rib.drawKeys")];
      }
      default: return [];
    }
  }
  // ---- choices with a preview: the purple's blend, a leg's flagging ----------------------------------------------------------------------
  function modesHtml(id, mode) {
    const vector = mapColors(E.map).length > 0;
    const list = id === "blend" ? BLENDS.filter(([k]) => k !== "layer" || vector) : FLAGS;
    const cur = id === "blend" ? (E.ev.appearance.blend === "layer" && !vector ? "blend" : E.ev.appearance.blend || "none") : (E.sel?.kind === "leg" ? M.legFlagging(E.ev, E.sel.c1, E.sel.c2) : "none");
    const dis = E.blank || E.readOnly ? "disabled" : "";
    if (mode === "line") {
      const i = reg({ t: "field", label: id === "blend" ? t("trc.rib.purple") : t("trc.rib.flagging"), tip: id === "blend" ? t("trc.rib.purpleTip") : t("trc.rib.flaggingTip") });
      return `<label class="tr-rfield line" data-ri="${i}"><span>${id === "blend" ? t("trc.rib.purple") : t("trc.rib.flagging")}</span><select data-rmode="${id}" ${dis}>${list.map(([k, l]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${l}</option>`).join("")}</select></label>`;
    }
    return `<div class="tr-rmodes">${list.map(([k, l, d]) => {
      const i = reg({ t: "small", label: id === "blend" ? t("trc.rib.blendMode", { mode: l }) : t("trc.rib.flagMode", { mode: l.toLowerCase() }), tip: d || (k === "none" ? t("trc.rib.flagNoneTip") : k === "all" ? t("trc.rib.flagAllTip") : k === "begin" ? t("trc.rib.flagBeginTip") : t("trc.rib.flagEndTip")) });
      return `<button type="button" class="tr-rmode" data-ri="${i}" data-rmode="${id}" data-v="${k}" aria-pressed="${k === cur}" ${dis}>${preview(id, k)}<span>${esc(l)}</span></button>`;
    }).join("")}</div>`;
  }
  function preview(id, k) {
    const P = "#a7179b";
    if (id === "blend") return `<svg viewBox="0 0 48 30" aria-hidden="true"><rect width="48" height="30" rx="3" fill="#fbf8ef"/><path d="M0 21L48 9" stroke="#1d1d1b" stroke-width="3"/>
      ${k === "layer" ? `<circle cx="24" cy="15" r="9" fill="none" stroke="${P}" stroke-width="2.4"/><path d="M0 21L48 9" stroke="#1d1d1b" stroke-width="3"/>`
        : `<circle cx="24" cy="15" r="9" fill="none" stroke="${P}" stroke-width="2.4" ${k === "blend" ? 'style="mix-blend-mode:multiply" opacity=".8"' : ""}/>`}</svg>`;
    const leg = (d) => `<path d="${d}" stroke="${P}" stroke-width="2" fill="none"`;
    return `<svg viewBox="0 0 48 30" aria-hidden="true"><rect width="48" height="30" rx="3" fill="#fbf8ef"/><circle cx="8" cy="23" r="5" fill="none" stroke="${P}" stroke-width="2"/><circle cx="40" cy="7" r="5" fill="none" stroke="${P}" stroke-width="2"/>
      ${k === "none" ? `${leg("M12 21L36 9")}/>` : k === "all" ? `${leg("M12 21L36 9")} stroke-dasharray="3 2"/>` : k === "begin" ? `${leg("M12 21L24 15")} stroke-dasharray="3 2"/>${leg("M24 15L36 9")}/>` : `${leg("M12 21L24 15")}/>${leg("M24 15L36 9")} stroke-dasharray="3 2"/>`}</svg>`;
  }
  // ---- the groups and the tabs -------------------------------------------------------------------------------------------------
  function groupHtml(g, mode, folded) {
    if (folded) {
      const name = g.title || t("trc.rib.more");
      const first = firstIcon(g.items) || "dots", i = reg({ t: "group", label: name, tip: t("trc.rib.foldedGroupTip", { name }) });
      if (mode === "line") return `<div class="tr-rgrp folded"><button type="button" class="tr-rsmall" data-ri="${i}" data-rfold="${esc(g.id)}" aria-haspopup="true">${svg(first, 16)}<span class="tr-rl">${esc(name)}</span><span class="tr-rcaret">▾</span></button></div>`;
      return `<div class="tr-rgrp folded"><div class="tr-rgrp-body"><button type="button" class="tr-rbig" data-ri="${i}" data-rfold="${esc(g.id)}" aria-haspopup="true">${svg(first, 26)}<span class="tr-rl">${esc(name)} ▾</span></button></div><div class="tr-rgrp-t">&nbsp;</div></div>`;
    }
    const li = g.launcher ? reg({ t: "small", act: g.launcher, label: launcherLabel(g.launcher), tip: t("trc.rib.launcherTip") }) : -1;
    return `<div class="tr-rgrp" data-g="${esc(g.id)}"><div class="tr-rgrp-body">${g.items.map((x) => itemHtml(x, mode)).join("")}</div>
      ${mode === "line" ? "" : `<div class="tr-rgrp-t">${esc(groupTitle(g))}</div>`}${li >= 0 && mode !== "line" ? `<button type="button" class="tr-rlaunch" data-ri="${li}" data-ract="${esc(g.launcher)}" aria-label="${esc(launcherLabel(g.launcher))}">${svg("launcher", 12)}</button>` : ""}</div>`;
  }
  const launcherLabel = (act) => ({ "special-more": t("trc.rib.allSpecials"), standards: t("trc.rib.launchStandards"), "course-props": t("trc.rib.courseProps"), "print-area": t("trc.rib.launchPrintArea"), appearance: t("trc.rib.launchAppearance") })[act] || t("trc.rib.launchMore");
  function groupTitle(g) {
    if (R.tab === "ctx:control" && g.id === "ctl") { const c = ctl(); return c ? (c.kind === "normal" ? t("trc.rib.controlCode", { code: c.code }) : { start: t("trc.rib.start"), finish: t("trc.rib.finish"), crossing: t("trc.rib.crossing"), "map-issue": t("trc.rib.mapIssue"), "map-exchange": t("trc.rib.mapExchange") }[c.kind] || t("trc.rib.control")) : g.title; }
    if (R.tab === "ctx:special" && g.id === "obj") return A.SPECIAL_NAME[special()?.kind] || g.title;
    if (R.tab === "ctx:leg" && g.id === "where") return t("trc.rib.leg");
    if (R.tab === "check" && g.id === "figures") return course() ? t("trc.rib.currentCourse") : t("trc.rib.theEvent");
    return g.title;
  }
  const firstIcon = (items) => { for (const it of items) { if (it.icon) return it.icon; if (it.items) { const k = firstIcon(it.items); if (k) return k; } if (it.t === "gallery") return "special"; } return null; };
  function bodyHtml(folded = 0) {
    R.items = [];
    const groups = curGroups(), mode = disp() === "line" ? "line" : "full";
    return groups.map((g, i) => groupHtml(g, mode, i >= groups.length - folded)).join("");
  }
  function tabsHtml() {
    const tab = (tb) => {
      const b = tb.badge ? badgeOf(tb.badge) : null;
      return `<button type="button" role="tab" class="tr-rtab${tb.backstage ? " file" : ""}" data-rtab="${tb.id}" aria-selected="${!tb.backstage && R.tab === tb.id}" ${E.blank && !tb.backstage && tb.id !== "home" ? 'data-blank="1"' : ""}>${esc(tb.label)}${b ? ` <span class="tr-rbadge${softBadge(tb.badge) ? " soft" : ""}" title="${esc(tb.badge === "issues" ? t("trc.rib.badgeIssues") : t("trc.rib.badgeComments"))}">${b}</span>` : ""}</button>`;
    };
    const ctx = R.ctx ? CONTEXT[R.ctx] : null;
    return `${tabs().map(tab).join("")}${ctx ? `<span class="tr-rctx${R.pulse ? " new" : ""}"><span class="tr-rctx-h">${esc(ctx.head)}</span><button type="button" role="tab" class="tr-rtab" data-rtab="ctx:${R.ctx}" aria-selected="${R.tab === `ctx:${R.ctx}`}">${esc(ctx.label)}</button></span>` : ""}`;
  }
  function render() {
    hideTip();                                                   // its button may be drawn again
    if (!host.firstChild) host.innerHTML = `<div class="tr-rtabs" role="tablist" aria-label="${esc(t("trc.rib.ariaTabs"))}"></div><div class="tr-rbody" role="toolbar" aria-label="${esc(t("trc.rib.ariaCommands"))}"></div>`;
    host.dataset.display = disp();
    host.classList.toggle("floating", wanted() === "folded" && R.floating);
    const tabsEl = host.querySelector(".tr-rtabs"), body = host.querySelector(".tr-rbody");
    const had = document.activeElement, hadTab = tabsEl.contains(had) ? had.dataset.rtab : null;
    tabsEl.innerHTML = tabsHtml();
    renderQat();
    if (hadTab) tabsEl.querySelector(`[data-rtab="${hadTab}"]`)?.focus({ preventScroll: true });
    // a field being typed in keeps its focus: the body is drawn again once it is left
    if (body.contains(document.activeElement) && document.activeElement.matches("input, select")) { R.stale = true; roving(); return; }
    R.stale = false;
    const hadBtn = body.contains(had) ? keyOf(had) : null;
    body.classList.remove("iconic");
    body.innerHTML = bodyHtml(0);
    fit(body);
    roving();
    if (hadBtn) (body.querySelector(`[data-ract="${hadBtn}"], [data-rtool="${hadBtn}"]`) || body.querySelector("button"))?.focus({ preventScroll: true });
  }
  const keyOf = (el) => el?.closest?.("[data-ract], [data-rtool]")?.dataset.ract || el?.closest?.("[data-rtool]")?.dataset.rtool || null;
  /** One Tab stop for the tabs (the selected one) and one for the ribbon (the button last used, else the first); the arrows do the rest. */
  function roving() {
    const tabs = [...host.querySelectorAll(".tr-rtabs [data-rtab]")];
    const sel = tabs.find((t) => t.getAttribute("aria-selected") === "true") || tabs[0];
    tabs.forEach((t) => { t.tabIndex = t === sel ? 0 : -1; });
    const btns = [...host.querySelectorAll(".tr-rbody button")];
    const cur = btns.find((b) => keyOf(b) === R.lastKey) || btns[0];
    btns.forEach((b) => { b.tabIndex = b === cur ? 0 : -1; });
  }
  /** Too wide: the single line drops its labels; then groups fold into one button each, from the right. */
  function fit(body) {
    if (wanted() === "folded" && !R.floating) return;
    if (!body.clientWidth) return;
    if (disp() === "line" && body.scrollWidth > body.clientWidth + 1) body.classList.add("iconic");
    const n = curGroups().length;
    for (let f = 1; f < n && body.scrollWidth > body.clientWidth + 1; f++) body.innerHTML = bodyHtml(f);
  }
  R.render = render;

  // ---- the selection's tab, live figures -------------------------------------------------------------------------------------
  const selKey = () => { const s = E.sel; return E.pending ? `drawing:${E.pending.kind}` : !s ? "" : `${s.kind}:${s.control ?? s.id ?? `${s.c1}-${s.c2}`}:${s.cc ?? ""}`; };
  /** Called by the editor after every refresh, tool change and drawing step. */
  R.update = () => {
    const ctx = ctxKind(E), key = selKey();
    if (key !== R.ctxKey) {
      R.ctxKey = key; R.ctx = ctx; R.pulse = false;
      if (!ctx) { if (R.tab.startsWith("ctx:")) R.tab = R.prevTab || "home"; }
      else if (R.tab.startsWith("ctx:")) R.tab = `ctx:${ctx}`;
      // chosen with the Sélection tool from « Tracer » (not just placed with a tool), or a shape being drawn: its tab opens
      else if (R.tab === "home" && (E.tool === "select" || ctx === "drawing")) { R.prevTab = R.tab; R.tab = `ctx:${ctx}`; }
      else R.pulse = true;
    }
    if (E.commentsData) R.comments = E.commentsData.items.filter((c) => !c.done).length || null;
    render();
    scheduleIssues();
  };
  let issueTimer = null, issueSig = "";
  function scheduleIssues() {
    if (E.blank) { R.issues = null; R.issueRows = []; return; }
    const sig = `${E.rev}:${E.ev.title}`;
    if (sig === issueSig) return;
    clearTimeout(issueTimer);
    issueTimer = setTimeout(async () => {
      issueSig = sig;
      try {
        const { audit } = await import("./reports.js");
        R.issueRows = issueRows(audit(E.ev)); R.issues = R.issueRows.length || null;
        R.issuesSoft = R.issueRows.every((r) => r.warn);
        R.checked = true;
        render();
      } catch (err) { console.error(err); }
    }, 500);
  }
  // comments still open, from the server when the event opens (team.js keeps E.commentsData up to date afterwards)
  if (!E.blank && E.meta?.id && !E.offline) S.loadJson(E.meta.id, "comments", E.key).then((r) => {
    const items = r?.data?.items || [];
    if (!E.commentsData) R.comments = items.filter((c) => !c.done).length || null;
    render();
  }).catch(() => {});

  // ---- running a command -----------------------------------------------------------------------------------------------------
  async function run(act, btn) {
    closePops();
    if (wanted() === "folded" && R.floating) { R.floating = false; render(); }
    switch (act) {
      case "special-more": D.specialMenu(E, btn || host); return;
      case "ribbon-full": case "ribbon-line": case "ribbon-folded": case "ribbon-auto": setDisplay(act.slice(7)); return;
      case "keytips": keytips(1); return;
      case "guide": window.open(GUIDE(curTab()?.guide || ""), "_blank"); return;
      case "backstage": openFileMenu(btn); return;
      default:
    }
    if (PICK[act]) {
      if (E.readOnly) { E.toast(t("trc.rib.readOnly")); return; }
      E.pickOnce = (p) => { const [sx, sy] = E.toScreen(...p); D.action(E, act, null, { p, sx, sy }); };
      E.pickCancel = null;
      E.help(t("trc.rib.pickHelp", { what: PICK[act] }));
      E.canvas.focus({ preventScroll: true });
      return;
    }
    await D.action(E, act, btn);
    if (document.body.contains(E.root)) render();                // a toggle (« Montrer la zone ») shows its new state
  }
  /** d: "full", "line", "folded", or "auto"; where: "ribbon" (in the page) or "ribbonFw" (full window), the current one by default. */
  function setDisplay(d, where = dispKey()) {
    savePref(where, ["full", "line", "folded"].includes(d) ? d : null);
    R.floating = false;
    render();
    E.fitHeight?.();
  }
  R.setDisplay = setDisplay;

  // ---- clicks ----------------------------------------------------------------------------------------------------------------
  host.addEventListener("click", (e) => {
    const t = e.target.closest("[data-rtab]");
    if (t) {
      const id = t.dataset.rtab;
      if (id === "file") { openFileMenu(t); return; }
      if (wanted() === "folded") R.floating = !(R.floating && R.tab === id);
      if (!id.startsWith("ctx:")) R.prevTab = id;
      R.tab = id; R.pulse = false; render();
      return;
    }
    const split = e.target.closest("[data-rsplit]");
    if (split) {
      e.stopPropagation();
      const it = R.items[Number(split.dataset.rsplit)], r = split.getBoundingClientRect();
      const big = split.closest(".tr-rbig")?.getBoundingClientRect() || r;
      D.popupMenu(E, Math.max(8, big.left), big.bottom + 4, it.split, (a) => run(a, split));
      return;
    }
    const fold = e.target.closest("[data-rfold]");
    if (fold) { openFolded(fold); return; }
    const mode = e.target.closest("button[data-rmode]");
    if (mode && !mode.disabled) { setMode(mode.dataset.rmode, mode.dataset.v); return; }
    const b = e.target.closest("button[data-ract], button[data-rtool]");
    if (!b) return;
    const it = R.items[Number(b.dataset.ri)];
    if (b.getAttribute("aria-disabled") === "true") { E.toast(it?.why || t("trc.rib.unavailable")); return; }
    if (b.dataset.rtool) { E.setTool(b.dataset.rtool); E.canvas.focus({ preventScroll: true }); if (wanted() === "folded") { R.floating = false; render(); } return; }
    run(b.dataset.ract, b);
  });
  host.addEventListener("change", (e) => {
    const f = e.target.closest("[data-rfield]");
    if (f) { setField(f.dataset.rfield, f); return; }
    const m = e.target.closest("select[data-rmode]");
    if (m) setMode(m.dataset.rmode, m.value);
  });
  host.addEventListener("input", (e) => { const f = e.target.closest('input[type="range"][data-rfield]'); if (f) FIELDS[f.dataset.rfield].set(Number(f.value)); });
  host.addEventListener("focusout", () => setTimeout(() => { if (R.stale && !host.contains(document.activeElement)) render(); }, 0));
  host.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("input[data-rfield]")) { e.preventDefault(); e.target.blur(); } });
  // the arrow keys: ← → through the tabs (each shown as it is reached) and through the buttons; ↓ from a tab into its ribbon, ↑ back;
  // ↑ ↓ within a pile of small buttons or the gallery; Début, Fin. Fields keep their own arrows (Tab reaches them).
  const visible = (body) => [...body.querySelectorAll("button")].filter((b) => b.offsetParent !== null);
  host.addEventListener("keydown", (e) => {
    const k = e.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(k) || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.matches("input, select, textarea")) return;
    const tabsEl = host.querySelector(".tr-rtabs"), body = host.querySelector(".tr-rbody"), tab = e.target.closest("[data-rtab]");
    if (tab) {
      e.preventDefault(); e.stopPropagation();
      if (k === "ArrowUp") return;
      if (k === "ArrowDown") { if (wanted() === "folded") { R.floating = true; render(); } const f = visible(body); (f.find((b) => b.tabIndex === 0) || f[0])?.focus(); return; }
      const tabs = [...tabsEl.querySelectorAll("[data-rtab]")];
      let i = tabs.indexOf(tab);
      i = k === "Home" ? 0 : k === "End" ? tabs.length - 1 : (i + (k === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      const id = tabs[i].dataset.rtab;
      if (id !== "file") { if (!id.startsWith("ctx:")) R.prevTab = id; R.tab = id; R.pulse = false; render(); }
      tabsEl.querySelector(`[data-rtab="${id}"]`)?.focus();
      return;
    }
    if (!body.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    const f = visible(body), b = e.target.closest("button"), i = f.indexOf(b);
    let to = null;
    if (k === "ArrowUp" || k === "ArrowDown") {
      const box = b?.closest(".tr-rstack, .tr-rgallery");
      if (box) {
        const inBox = [...box.querySelectorAll("button")].filter((x) => x.offsetParent !== null), j = inBox.indexOf(b), step = box.matches(".tr-rgallery") ? 4 : 1;
        to = inBox[j + (k === "ArrowDown" ? step : -step)] || null;
      }
      if (!to && k === "ArrowUp") { tabsEl.querySelector('[aria-selected="true"]')?.focus(); return; }
    } else to = k === "Home" ? f[0] : k === "End" ? f[f.length - 1] : f[(i + (k === "ArrowRight" ? 1 : -1) + f.length) % f.length];
    to?.focus();
  });
  host.addEventListener("focusin", (e) => {
    const b = e.target.closest(".tr-rbody button");
    if (!b) return;
    R.lastKey = keyOf(b);
    host.querySelectorAll(".tr-rbody button").forEach((x) => { x.tabIndex = x === b ? 0 : -1; });
  });
  // a right-click on a button of the ribbon: add it to the quick-access bar, or take it off
  host.addEventListener("contextmenu", (e) => {
    const b = e.target.closest("button[data-ract], button[data-rtool]");
    if (!b) return;
    e.preventDefault();
    const k = b.dataset.rtool ? `tool:${b.dataset.rtool}` : b.dataset.ract, inBar = qatList().includes(k);
    D.popupMenu(E, e.clientX, e.clientY, [[inBar ? "qat-remove" : "qat-add", inBar ? t("trc.rib.qatRemove") : t("trc.rib.qatAdd")], ["qat-menu", t("trc.rib.qatCustomise")]], (a) => {
      if (a === "qat-menu") { qatMenu(); return; }
      setQat(inBar ? qatList().filter((x) => x !== k) : [...qatList(), k]);
    });
  });
  function setField(id, el) {
    const f = FIELDS[id];
    if (!f || f.range) return;
    if (f.num) { const v = Number(String(el.value).replace(",", ".")); if (!(v > 0.2 && v <= 5)) { el.value = f.get(); E.toast(t("trc.rib.proportion")); return; } f.set(Math.round(v * 100) / 100); return; }
    f.set(f.text ? el.value.trim() : el.value, el);
  }
  function setMode(id, v) {
    if (E.readOnly || E.blank) return;
    if (id === "blend") E.change((x) => { x.appearance.blend = v; if (v === "layer" && x.appearance.lowerPurpleLayer == null) x.appearance.lowerPurpleLayer = defaultLayer(E.map); }, t("trc.rib.undoBlend"));
    else if (id === "flag") D.action(E, `flag-${v}`, null);
  }

  // ---- the quick-access bar: undo and redo (the title bar's own), then the user's commands, then ▾ to change them ------------------
  const qatEl = E.$("#tr-qatx"), qatMore = E.$("#tr-qatmore");
  const qatList = () => { const l = loadPref("qat", null); return (Array.isArray(l) ? l : QAT_DEFAULT).filter((k) => E.pro || !isPro(k.startsWith("tool:") ? { tool: k.slice(5) } : { act: k })); };
  function setQat(list) { savePref("qat", list); renderQat(); }
  /** What a key of the bar is: an action, « tool:… » a tool, « undo », « redo ». */
  function qatInfo(k) {
    if (k === "undo") return { act: "undo", label: t("trc.rib.undo"), icon: "undo", key: "Ctrl+Z" };
    if (k === "redo") return { act: "redo", label: t("trc.rib.redo"), icon: "redo", key: "Ctrl+Y" };
    if (k === "pdf-course") return { act: k, label: t("trc.rib.pdfThisCourse"), icon: "printer", tip: t("trc.rib.pdfThisCourseTip") };
    if (k.startsWith("tool:special:")) { const sp = k.slice(13); return { t: "small", tool: k.slice(5), label: A.SPECIAL_NAME[sp] || sp, icon: ACT_OF[sp] || sp, need: "edit" }; }
    const tool = k.startsWith("tool:") ? k.slice(5) : null, c = commands().find((x) => (tool ? x.tool === tool : x.act === k));
    // the bar has no tab around it: a few names said in full
    const full = { "course-props": t("trc.rib.courseProps"), "pdf-courses": t("trc.rib.pdfCourses"), "export-iof3": "IOF XML 3.0", "versions": t("trc.rib.versions"), "comments": t("trc.rib.teamComments") }[k];
    if (c) return full ? { ...c, label: full } : c;
    for (const sec of BACKSTAGE) for (const [act, l, d] of [...(sec.items || []), ...(sec.groups || []).flatMap((g) => g[1])]) if (act === k) return { act, label: l, tip: d, icon: ACT_ICON_OF(act) };
    return { act: k, label: k, icon: ACT_ICON_OF(k) };
  }
  function renderQat() {
    if (!qatEl) return;
    const list = qatList();
    E.$("#tr-undo")?.classList.toggle("tr-qhide", !list.includes("undo"));
    E.$("#tr-redo")?.classList.toggle("tr-qhide", !list.includes("redo"));
    qatEl.innerHTML = list.filter((k) => k !== "undo" && k !== "redo").map((k) => {
      const it = qatInfo(k), w = why(it);
      const title = `${it.label}${it.key ? ` (${it.key})` : ""}${it.tip ? ` — ${it.tip}` : ""}${w ? `\n${w}` : ""}`;
      return `<button type="button" class="tr-icon" data-qk="${esc(k)}" title="${esc(title)}" aria-label="${esc(it.label)}" ${w ? 'aria-disabled="true"' : ""}>${svg(it.icon || "dots")}</button>`;
    }).join("");
  }
  qatEl?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-qk]");
    if (!b) return;
    const it = qatInfo(b.dataset.qk);
    if (b.getAttribute("aria-disabled") === "true") { E.toast(why(it) || t("trc.rib.unavailable")); return; }
    if (it.tool) E.setTool(it.tool); else run(it.act, b);
  });
  qatEl?.addEventListener("contextmenu", (e) => {
    const b = e.target.closest("[data-qk]");
    if (!b) return;
    e.preventDefault();
    D.popupMenu(E, e.clientX, e.clientY, [["qat-remove", t("trc.rib.qatRemove")], ["qat-menu", t("trc.rib.qatCustomise")]], (a) => {
      if (a === "qat-menu") qatMenu(); else setQat(qatList().filter((x) => x !== b.dataset.qk));
    });
  });
  /** ▾: the commands one is likely to want in the bar, ticked when they are in it; one click adds or removes. */
  function qatMenu() {
    const list = qatList(), r = (qatMore || qatEl).getBoundingClientRect();
    const extra = list.filter((k) => !QAT_CHOICES.includes(k)), choices = QAT_CHOICES.filter((k) => E.pro || !isPro({ act: k }));
    const items = [...choices, ...extra].map((k) => [k, `${qatInfo(k).label}${list.includes(k) ? "  ✓" : ""}`]);
    D.popupMenu(E, Math.max(8, r.left - 120), r.bottom + 4, [...items, "-", ["qat-reset", t("trc.rib.qatDefaults")], ["qat-help", t("trc.rib.qatOther")]], (k) => {
      if (k === "qat-reset") { setQat(null); return; }
      if (k === "qat-help") { E.toast(t("trc.rib.qatHelp")); return; }
      setQat(list.includes(k) ? list.filter((x) => x !== k) : [...list, k]);
    });
  }
  qatMore?.addEventListener("click", (e) => { e.stopPropagation(); qatMenu(); });

  // ---- popups: folded groups, the display menu ---------------------------------------------------------------------------------
  function closePops() { for (const p of R.pops.splice(0)) p.remove(); host.querySelectorAll('[aria-expanded="true"]').forEach((b) => b.setAttribute("aria-expanded", "false")); }
  R.closePops = closePops;
  function openFolded(btn) {
    const open = R.pops.find((p) => p.dataset.for === btn.dataset.rfold);
    closePops();
    if (open) return;
    const g = curGroups().find((x) => x.id === btn.dataset.rfold);
    if (!g) return;
    const pop = document.createElement("div");
    pop.className = "tr-pop tr-rpop"; pop.dataset.for = g.id;
    pop.innerHTML = groupHtml(g, "full", false);
    E.root.appendChild(pop); R.pops.push(pop);
    const r = btn.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8))}px`; pop.style.top = `${r.bottom + 4}px`;
    btn.setAttribute("aria-expanded", "true");
    pop.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-ract], button[data-rtool]");
      const m = e.target.closest("button[data-rmode]");
      if (m) { setMode(m.dataset.rmode, m.dataset.v); closePops(); return; }
      if (!b) return;
      const it = R.items[Number(b.dataset.ri)];
      if (b.getAttribute("aria-disabled") === "true") { E.toast(it?.why || t("trc.rib.unavailable")); return; }
      closePops();
      if (b.dataset.rtool) E.setTool(b.dataset.rtool); else run(b.dataset.ract, b);
    });
    pop.addEventListener("change", (e) => { const f = e.target.closest("[data-rfield]"); if (f) setField(f.dataset.rfield, f); });
    bindTips(pop);
  }
  document.addEventListener("pointerdown", (e) => { if (R.pops.length && !R.pops.some((p) => p.contains(e.target)) && !e.target.closest("[data-rfold]")) closePops();
    if (R.floating && !host.contains(e.target) && !e.target.closest(".tr-pop, .tr-modal")) { R.floating = false; render(); } }, true);
  const dispBtn = E.$("#tr-rdisplay");
  dispBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    const r = dispBtn.getBoundingClientRect(), c = chosen(), on = (k) => ((c || "auto") === k ? " ✓" : "");
    D.popupMenu(E, r.right - 290, r.bottom + 4, [["ribbon-auto", `${t("trc.rib.dispAuto", { how: FW.isFull() ? t("trc.rib.dispAutoFw") : t("trc.rib.dispAutoPage") })}${on("auto")}`],
      ["ribbon-full", `${t("trc.rib.dispFull")}${on("full")}`], ["ribbon-line", `${t("trc.rib.dispLine")}${on("line")}`], ["ribbon-folded", `${t("trc.rib.dispFolded")}${on("folded")}`], "-",
      ["keytips", t("trc.rib.keytips")], ["guide", t("trc.rib.guide")]], (a) => run(a, dispBtn));
  });

  // ---- tooltips ----------------------------------------------------------------------------------------------------------------
  let tip = null, tipTimer = null, tipFor = null;
  function hideTip() { clearTimeout(tipTimer); tip?.remove(); tip = null; tipFor = null; }
  function showTip(el) {
    const it = R.items[Number(el.dataset.ri)];
    if (!it) return;
    hideTip(); tipFor = el;
    tipTimer = setTimeout(() => {
      if (!document.contains(el)) return;
      tip = document.createElement("div");
      tip.className = "tr-rtip"; tip.setAttribute("role", "tooltip");
      tip.innerHTML = `<b><span>${esc(it.label)}</span>${it.key ? `<kbd>${esc(it.key)}</kbd>` : ""}</b>${it.tip ? `<p>${esc(it.tip)}</p>` : ""}${it.why ? `<p class="tr-rtip-why">${esc(it.why)}</p>` : ""}
        ${isPro(it) ? `<p class="tr-rtip-pro">${esc(t("trc.rib.tipPro"))}</p>` : ""}<p class="tr-rtip-more">${esc(t("trc.rib.tipF1"))}</p>`;
      document.body.appendChild(tip);
      const r = el.getBoundingClientRect();
      tip.style.left = `${Math.max(8, Math.min(r.left, window.innerWidth - tip.offsetWidth - 8))}px`;
      tip.style.top = `${Math.min(r.bottom + 6, window.innerHeight - tip.offsetHeight - 8)}px`;
    }, 450);
  }
  function bindTips(root) {
    root.addEventListener("pointerover", (e) => { const el = e.target.closest("[data-ri]"); if (el && el !== tipFor) showTip(el); });
    root.addEventListener("pointerout", (e) => { const el = e.target.closest("[data-ri]"); if (el && !el.contains(e.relatedTarget)) hideTip(); });
    root.addEventListener("focusin", (e) => { const el = e.target.closest("[data-ri]"); if (el) showTip(el); });
    root.addEventListener("focusout", hideTip);
    root.addEventListener("pointerdown", hideTip);
  }
  bindTips(host);

  // ---- the « Fichier » menu (owner, 2026-11-07: a menu as Cartographier's; its long lists — the formats, the ways in, the
  //      sharing — in dialogs of cards, each with its file extension and what it is for; « Informations » and « Options » dialogs too)
  const ELL = "…";
  const EXT = { "pdf-courses": ".pdf", "pdf-descriptions": ".pdf", "pdf-punch": ".pdf", "export-iof3": ".xml", "export-iof2": ".xml",
    "export-iof2-sep": ".xml", "export-gpx": ".gpx", "export-kml": ".kml", "export-images": ".png · .jpg · .gif", "export-routegadget": ".zip",
    "export-ocn": ".ozmt", "export-ocad": ".ocd · .omap", "export-ppen": ".ppen", "export-csv": ".csv", "export-geotiff": ".tif",
    "export-svg": ".svg", "export-kmz": ".kmz", "export-maprun": ".kml", "export-ocadcsv": ".txt", "export-livelox": ".zip",
    "start-import": ".ozmt · .ppen · .ocd", "import-courses": ".xml · .ocd" };
  const sect = (id) => BACKSTAGE.find((x) => x.id === id);
  const itemLabel = (id, act) => (sect(id).items || []).find((x) => x[0] === act)?.[1] || act;
  function fileMenuItems() {
    return [["start-new", t("trc.page.newEvent") + ELL], ["start-open", t("trc.page.openEvent") + ELL], ["bs:import", sect("import").label + ELL, "import"], "-",
      ["save", itemLabel("save", "save")], ["version-save", itemLabel("save", "version-save")], ["versions", itemLabel("save", "versions") + ELL], "-",
      ["bs:export", sect("export").label + ELL, "export"], ["bs:share", sect("share").label + ELL, "team"], ["offline", itemLabel("offline", "offline")], "-",
      ["bs:info", sect("info").label + ELL, "sliders"], ["bs:options", sect("options").label + ELL, "sliders"]];
  }
  function openFileMenu(btn) {
    closePops(); hideTip();
    const r = (btn || host.querySelector('[data-rtab="file"]') || host).getBoundingClientRect();
    D.popupMenu(E, r.left, r.bottom + 2, fileMenuItems(), (a) => (a.startsWith("bs:") ? openSection(a.slice(3)) : run(a, null)));
  }
  R.openFileMenu = openFileMenu;
  const cardItem = ([act, label, desc]) => ({ act, label, desc, ext: EXT[act] || "", icon: ACT_ICON_OF(act) });
  async function openSection(id) {
    closePops(); hideTip();
    const sec = sect(id);
    if (!sec) return;
    if (sec.items || sec.groups) {
      const groups = sec.groups ? sec.groups.map(([title, items]) => ({ title, items: bsItems(items).map(cardItem) })) : [{ title: "", items: bsItems(sec.items).map(cardItem) }];
      const act = await D.chooser(E, { title: sec.label, sub: sec.groups ? t("trc.rib.bsEachFile") : "", groups, last: id === "export" || id === "import" ? id : null, search: id === "export" });
      if (act) run(act, null);
      return;
    }
    // « Informations » and « Options »: their page in a dialog, its cards running a command or changing a setting in place
    D.fileDialog(E, { title: sec.label, body: pageHtml(id), onClick: (e, dlg) => {
      const a = e.target.closest("[data-bs-run]");
      if (a?.dataset.bsRun === "qat-reset") { setQat(null); dlg.set(pageHtml(id)); return; }
      if (a) { dlg.close(); run(a.dataset.bsRun, null); return; }
      const d = e.target.closest("[data-bs-disp]");
      if (d) { const [where, k] = d.dataset.bsDisp.split(":"); setDisplay(k, where); dlg.set(pageHtml(id)); }
    } });
  }
  R.openSection = openSection;
  // the « Fichier » page's commands of the advanced level: for administrators only
  const bsItems = (list) => list.filter(([act]) => E.pro || !isPro({ act }));
  const card = ([act, t, d]) => `<button type="button" class="tr-bs-card" data-bs-run="${act}">${svg(ACT_ICON_OF(act), 22)}<b>${esc(t)}</b><span>${esc(d)}</span></button>`;
  function pageHtml(s) {
    if (s === "info") {
      if (E.blank) return `<h3>${esc(t("trc.rib.bsNoEvent"))}</h3><p class="tr-bs-sub">${esc(t("trc.rib.bsNoEventSub"))}</p>
        <div class="tr-bs-cards">${card(["start-new", t("trc.rib.bsNewEvent"), t("trc.rib.bsNewEventDesc")])}${card(["start-open", t("trc.rib.bsOpenEvent"), t("trc.rib.bsOpenEventDesc")])}${card(["start-import", t("trc.rib.bsImportEvent"), t("trc.rib.bsImportEventDesc")])}</div>`;
      const ev = E.ev, m = E.meta || {}, n = Object.values(ev.controls).filter((c) => c.kind === "normal").length;
      const map = E.map ? (E.map.kind === "vector" ? (E.map.format === "oom" ? "OpenOrienteering Mapper" : `OCAD ${E.map.version || ""}`) : E.map.kind === "pdf" ? "PDF" : t("trc.rib.mapImage")) : t("trc.rib.mapNone");
      const role = { owner: t("trc.rib.roleOwner"), setter: t("trc.rib.roleSetter"), controller: t("trc.rib.roleController"), viewer: t("trc.rib.roleViewer") }[E.role] || E.role || "";
      return `<h3>${esc(ev.title.replace(/\|/g, " ") || m.title || t("trc.rib.event"))}</h3><p class="tr-bs-sub">${esc(m.kind === "race" ? t("trc.rib.competition") : t("trc.rib.training"))}${m.date ? ` · ${new Date(m.date).toLocaleDateString(locale(), { dateStyle: "long" })}` : ""}</p>
        <dl class="tr-bs-info"><dt>${esc(t("trc.rib.bsMap"))}</dt><dd>${esc(ev.map.file || m.map?.name || "")} · ${esc(map)} · 1:${nf(ev.map.scale)}${hasGeo(ev) ? ` · ${esc(t("trc.rib.georefShort"))}` : ""}</dd>
          <dt>${esc(t("trc.rib.bsCourses"))}</dt><dd>${M.courseIds(ev).map((id) => esc(ev.courses[id].name)).join(", ") || esc(t("trc.rib.none"))} · ${esc(tn("trc.rib.nControls", n))}</dd>
          <dt>${esc(t("trc.rib.bsRole"))}</dt><dd>${esc(role)}${E.readOnly ? ` · ${esc(t("trc.rib.readOnlyShort"))}` : ""}</dd><dt>${esc(t("trc.rib.bsEncryption"))}</dt><dd>${esc(E.key ? t("trc.rib.encryptedYes") : t("trc.rib.encryptedNo"))}</dd>
          <dt>${esc(t("trc.rib.bsSaved"))}</dt><dd>${esc(E.lastSaved ? t("trc.rib.savedAt", { time: E.lastSaved.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) }) : t("trc.rib.savedAuto"))}</dd></dl>
        <div class="tr-bs-cards">${card(["event-props", t("trc.rib.bsProps"), t("trc.rib.bsPropsDesc")])}${card(["team", t("trc.rib.bsTeam"), t("trc.rib.bsTeamDesc")])}${card(["encryption", t("trc.rib.bsEncryptionCard"), t("trc.rib.bsEncryptionDesc")])}</div>`;
    }
    if (s === "options") {
      const dp = (where, k, label, d) => { const on = (chosen(where) || "auto") === k; return `<button type="button" class="tr-bs-card${on ? " on" : ""}" data-bs-disp="${where}:${k}">${svg(k === "full" ? "ribbon" : k === "line" ? "minus" : k === "auto" ? "sliders" : "fit", 22)}<b>${esc(label)}${on ? " ✓" : ""}</b><span>${esc(d)}</span></button>`; };
      const qat = (loadPref("qat", null) || QAT_DEFAULT).map((k) => qatInfo(k).label).join(", ");
      return `<p class="tr-bs-sub">${esc(t("trc.rib.optKept"))}</p>
        <h4>${esc(t("trc.rib.optRibbonPage"))}</h4><div class="tr-bs-cards">${dp("ribbon", "auto", t("trc.rib.optAuto"), t("trc.rib.optAutoPageDesc"))}${dp("ribbon", "full", t("trc.rib.optFull"), t("trc.rib.optFullDesc"))}
          ${dp("ribbon", "line", t("trc.rib.optLine"), t("trc.rib.optLineDesc"))}${dp("ribbon", "folded", t("trc.rib.optFolded"), t("trc.rib.optFoldedDesc"))}</div>
        <h4>${esc(t("trc.rib.optRibbonFw"))}</h4><div class="tr-bs-cards">${dp("ribbonFw", "auto", t("trc.rib.optAuto"), t("trc.rib.optAutoFwDesc"))}${dp("ribbonFw", "full", t("trc.rib.optFull"), t("trc.rib.optFullFwDesc"))}${dp("ribbonFw", "line", t("trc.rib.optLine"), t("trc.rib.optLineFwDesc"))}</div>
        <h4>${esc(t("trc.rib.optQat"))}</h4><p class="tr-bs-sub">${esc(t("trc.rib.optQatWhere", { list: qat }))}</p>
        <div class="tr-bs-cards">${card(["qat-reset", t("trc.rib.qatDefaults"), t("trc.rib.qatDefaultsDesc")])}</div>
        <h4>${esc(t("trc.rib.optFiles"))}</h4><div class="tr-bs-cards">${card(["save-to", t("trc.rib.optSeveralFiles"), t("trc.rib.optSeveralFilesDesc")])}</div>`;
    }
    return "";
  }

  // ---- finding a command ------------------------------------------------------------------------------------------------------
  const search = E.$("#tr-rsearch"), res = E.$("#tr-rsearch-res");
  let found = [];
  function index() {
    const out = commands().filter((c) => E.pro || !c.pro).map((c) => ({ ...c, where: `${c.tab.label}${c.group.title ? ` › ${c.group.title}` : ""}` }));
    const specials = TABS[1].groups.find((g) => g.id === "specials")?.title || "";
    for (const k of Object.keys(A.SPECIAL_NAME)) if (E.pro || !isPro({ tool: `special:${k}` })) out.push({ tool: `special:${k}`, label: A.SPECIAL_NAME[k], icon: ACT_OF[k] || k, tip: SPECIAL_TIP(k), tab: TABS[1], group: { title: specials }, where: `${TABS[1].label} › ${specials}`, need: "edit" });
    for (const s of BACKSTAGE) for (const [act, l, d] of bsItems([...(s.items || []), ...(s.groups || []).flatMap((g) => g[1])])) if (!out.some((x) => x.act === act)) out.push({ act, label: l, tip: d, icon: ACT_ICON_OF(act), where: `${TABS[0].label} › ${s.label}`, backstage: true });
    out.push({ act: "ribbon-line", label: t("trc.rib.searchLine"), tip: "", icon: "minus", where: t("trc.rib.searchDisplay"), backstage: true });
    out.push({ act: "ribbon-folded", label: t("trc.rib.searchFold"), tip: "Ctrl+F1", icon: "fit", where: t("trc.rib.searchDisplay"), backstage: true });
    return out;
  }
  function showResults() {
    const q = norm(search.value.trim());
    if (!q) { res.hidden = true; return; }
    const words = q.split(/\s+/);
    found = index().filter((c) => { const h = norm(`${c.label} ${c.tip || ""} ${c.where}`); return words.every((w) => h.includes(w)); });
    // the names first, then the descriptions
    const rank = (c) => { const l = norm(c.label), w = words[0]; return l.startsWith(w) ? 4 : l.split(/[\s'’«(]+/).some((x) => x.startsWith(w)) ? 3 : l.includes(w) ? 2 : norm(c.where).includes(w) ? 1 : 0; };
    found = found.map((c, i) => [rank(c), i, c]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map((x) => x[2]);
    found = found.filter((c, i) => found.findIndex((x) => (x.act || x.tool) === (c.act || c.tool) && x.ctx === c.ctx) === i).slice(0, 9);
    res.hidden = false;
    res.innerHTML = found.length ? found.map((c, i) => `<button type="button" data-fi="${i}" class="${i === 0 ? "on" : ""}">${svg(c.icon || "dots", 16)}<span>${esc(c.label)}</span><small>${esc(c.where)}</small></button>`).join("")
      : `<p class="tr-rsearch-none">${esc(t("trc.rib.searchNone"))}</p>`;
  }
  async function choose(c) {
    res.hidden = true; search.value = ""; search.blur();
    if (c.ctx) {
      if (R.ctx !== c.ctx) { E.toast(t("trc.rib.inCtxTab", { label: c.label, tab: CONTEXT[c.ctx].label, what: ({ control: t("trc.rib.aControl"), leg: t("trc.rib.aLeg"), special: t("trc.rib.anItem"), drawing: t("trc.rib.aDrawing") })[c.ctx] }), 6000); return; }
      R.tab = `ctx:${c.ctx}`;
    } else if (!c.backstage && c.tab?.id && c.tab.id !== "file") { if (!c.tab.id.startsWith("ctx:")) R.prevTab = c.tab.id; R.tab = c.tab.id; }
    render();
    const sel = c.tool ? `[data-rtool="${c.tool}"]` : `[data-ract="${c.act}"]`, b = host.querySelector(sel);
    if (b) { b.classList.add("tr-rflash"); setTimeout(() => b.classList.remove("tr-rflash"), 1600); }
    const w = why(c);
    if (w) { E.toast(w); return; }
    if (c.tool) E.setTool(c.tool); else run(c.act, b);
  }
  search?.addEventListener("input", showResults);
  search?.addEventListener("focus", showResults);
  search?.addEventListener("blur", () => setTimeout(() => { res.hidden = true; }, 160));
  search?.addEventListener("keydown", (e) => {
    const items = [...res.querySelectorAll("[data-fi]")], cur = items.findIndex((x) => x.classList.contains("on"));
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); const n = (cur + (e.key === "ArrowDown" ? 1 : -1) + items.length) % (items.length || 1); items.forEach((x, i) => x.classList.toggle("on", i === n)); }
    else if (e.key === "Enter") { e.preventDefault(); const c = found[Math.max(0, cur)]; if (c) choose(c); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); search.value = ""; res.hidden = true; search.blur(); }
  });
  res?.addEventListener("mousedown", (e) => { const b = e.target.closest("[data-fi]"); if (b) { e.preventDefault(); choose(found[Number(b.dataset.fi)]); } });

  // ---- the keyboard: Alt for the key hints, Alt+Q the search, Ctrl+F1 to fold, F1 the guide ------------------------------------------------
  let altAlone = false;
  function keytips(level) {
    hideKeytips();
    R.keytips = level;
    if (!level) return;
    if (wanted() === "folded" && level === 2) { R.floating = true; render(); }
    const put = (el, k) => { const r = el.getBoundingClientRect(), h = E.root.getBoundingClientRect(); if (!r.width) return; const s = document.createElement("span"); s.className = "tr-rkt"; s.textContent = k; s.style.left = `${r.left - h.left + r.width / 2}px`; s.style.top = `${r.bottom - h.top - 6}px`; E.root.appendChild(s); el.dataset.kt = k; };
    if (level === 1) {
      host.querySelectorAll(".tr-rtabs [data-rtab]").forEach((b) => { const id = b.dataset.rtab; put(b, id.startsWith("ctx:") ? "Z" : tabs().find((t) => t.id === id)?.key || "?"); });
      const s = E.$("#tr-rsearch"); if (s) put(s, "Q");
    } else {
      const used = new Set();
      host.querySelectorAll(".tr-rbody [data-ri]").forEach((b) => {
        if (b.matches("label")) return;
        const it = R.items[Number(b.dataset.ri)] || {};
        const cand = [it.key, ...norm(it.label).toUpperCase().replace(/[^A-Z]/g, "")].filter((c) => c && c.length === 1);
        let k = cand.find((c) => !used.has(c));
        for (let i = 0; !k && i < 26; i++) { const c = `Y${String.fromCharCode(65 + i)}`; if (!used.has(c)) k = c; }
        used.add(k); put(b, k);
      });
    }
  }
  function hideKeytips() { R.keytips = 0; R.ktBuf = ""; E.root.querySelectorAll(".tr-rkt").forEach((x) => x.remove()); host.querySelectorAll("[data-kt]").forEach((b) => delete b.dataset.kt); }
  R.keytips = 0;
  const onKey = (e) => {
    if (!document.body.contains(E.root)) return;
    if (document.querySelector(".tr-modal, .tr-start")) { if (R.keytips) hideKeytips(); return; }
    if (e.key === "Alt" && !e.ctrlKey && !e.shiftKey && !e.metaKey) { altAlone = true; if (e.type === "keydown") e.preventDefault(); return; }
    if (e.type === "keyup") return;
    altAlone = false;
    if (e.altKey && !e.ctrlKey && e.key.toLowerCase() === "q") { e.preventDefault(); search?.focus(); return; }
    if (e.ctrlKey && e.key === "F1") { e.preventDefault(); setDisplay(wanted() === "folded" ? (FW.isFull() ? "line" : "full") : "folded"); return; }
    if (e.key === "F1" && !e.ctrlKey) { e.preventDefault(); const it = tipFor ? R.items[Number(tipFor.dataset.ri)] : null; window.open(GUIDE(guideOf(it) || curTab()?.guide || ""), "_blank"); return; }
    if (e.key === "Escape" && !R.keytips && (R.pops.length || R.floating)) { e.preventDefault(); e.stopPropagation(); closePops(); if (R.floating) { R.floating = false; render(); } return; }
    if (!R.keytips) return;
    if (e.target.closest?.("input, textarea, select")) { hideKeytips(); return; }
    e.preventDefault(); e.stopPropagation();
    if (e.key === "Escape") { if (R.keytips === 2) keytips(1); else hideKeytips(); return; }
    const k = e.key.length === 1 ? e.key.toUpperCase() : "";
    if (!k) return;
    if (R.keytips === 1) {
      if (k === "Q") { hideKeytips(); search?.focus(); return; }
      if (k === "F") { hideKeytips(); openFileMenu(); return; }
      const t = k === "Z" ? (R.ctx ? `ctx:${R.ctx}` : null) : tabs().find((x) => x.key === k && !x.backstage)?.id;
      if (!t) return;
      if (!t.startsWith("ctx:")) R.prevTab = t;
      R.tab = t; R.pulse = false; render(); keytips(2);
      return;
    }
    R.ktBuf = (R.ktBuf || "") + k;
    const b = [...host.querySelectorAll("[data-kt]")].find((x) => x.dataset.kt === R.ktBuf);
    if (b) { hideKeytips(); b.click(); return; }
    if (![...host.querySelectorAll("[data-kt]")].some((x) => x.dataset.kt.startsWith(R.ktBuf))) R.ktBuf = "";
  };
  const onKeyUp = (e) => {
    if (!document.body.contains(E.root)) return;
    if (e.key === "Alt" && altAlone) { altAlone = false; e.preventDefault(); if (document.querySelector(".tr-modal, .tr-start")) return; if (R.keytips) hideKeytips(); else keytips(1); }
  };
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("keyup", onKeyUp, true);
  E.root.addEventListener("pointerdown", () => { if (R.keytips) hideKeytips(); });
  const guideOf = (it) => {
    if (!it) return "";
    const c = commands().find((x) => (it.act && x.act === it.act) || (it.tool && x.tool === it.tool));
    return c?.group?.guide || (c?.ctx ? CONTEXT[c.ctx].guide : c?.tab?.guide) || "";
  };
  // full window on or off, a window taller or shorter than 800 px: the display wanted may change
  let lastFw = FW.isFull(), lastShort = window.innerHeight < 800;
  const onResize = () => {
    const fw = FW.isFull(), short = window.innerHeight < 800;
    if (fw === lastFw && short === lastShort) return;
    lastFw = fw; lastShort = short; R.floating = false; render(); E.fitHeight?.();
  };
  window.addEventListener("resize", onResize);
  E.closeHooks.push(() => window.removeEventListener("resize", onResize));
  // the ribbon is drawn again when its width changes (groups fold and unfold)
  let lastW = 0;
  const ro = new ResizeObserver(() => { const w = host.clientWidth; if (Math.abs(w - lastW) > 2) { lastW = w; render(); } });
  ro.observe(host);
  E.closeHooks.push(() => {
    ro.disconnect(); clearTimeout(issueTimer); hideTip(); closePops(); hideKeytips();
    document.removeEventListener("keydown", onKey, true); document.removeEventListener("keyup", onKeyUp, true);
  });
  /** Owns Échap while something of its own is open. */
  R.ownsEscape = () => !!(R.keytips || R.pops.length || E.$(".tr-bs") || (wanted() === "folded" && R.floating));
  render();
  return R;
}

/** The event audit's findings, one line each, the problems before the reminders (« Vérifier »: its count and its first lines). */
// the audit's sections and rows are known by their id and tag (reports.js: section.id, row.tag), whatever the language
function issueRows(rep) {
  const out = [];
  for (const s of rep.sections) {
    const id = s.id || "";
    if (id === "near") { for (const r of s.rows) if (r[3]) out.push({ text: t("trc.rib.issNear", { codes: r[0], dist: r[1], text: r[3].replace(/\s*\((IOF|sprint)[^)]*\)/g, "") }) }); }
    else if (id === "both") { for (let i = 0; i < s.rows.length; i += 2) out.push({ text: t("trc.rib.issBoth", { leg: s.rows[i][0] }), warn: true }); }
    else if (id === "unused") out.push({ text: tn("trc.rib.issUnused", s.rows.length), warn: true });
    else if (id === "missing") { for (const r of s.rows) out.push({ text: t("trc.rib.issColon", { a: r[0], b: r[2].replace(/\s*\(.*\)/, "") }), warn: r.tag === "climb" || r.tag === "load" }); }
    else if (id === "repeated") { for (const r of s.rows) out.push({ text: t("trc.rib.issRepeated", { course: r[0], control: r[1], text: r[2] }) }); }
    else if (id === "descr") { for (const r of s.rows) out.push({ text: t("trc.rib.issDescr", { control: r[0], text: r[2] }), warn: true }); }
    else if (id === "more") { for (const r of s.rows) out.push({ text: r[0] ? t("trc.rib.issMore", { course: r[0], obj: r[1], text: r[2] }) : t("trc.rib.issColon", { a: r[1], b: r[2] }), warn: r.tag === "short" || r.tag === "dog-leg" || r.tag === "first-dir" || r.tag === "desc-box" }); }
    else if (id === "units") { for (const r of s.rows) out.push({ text: r.filter(Boolean).join(" · ") }); }
    else for (const r of s.rows) out.push({ text: r.filter(Boolean).join(" · "), warn: true });
  }
  // « Circuit A : la dénivelée… »: the audit's sentences go on after a colon (« : » in French, ":" in English)
  for (const o of out) o.text = o.text.replace(/( ?:) ([A-ZÀ-Ý])(?=[a-zà-ÿ])/g, (m, p, c) => `${p} ${c.toLowerCase()}`);
  return out.sort((a, b) => (a.warn ? 1 : 0) - (b.warn ? 1 : 0));
}

// the special objects' icons and a word on each (the gallery, the search)
const ACT_OF = { "first-aid": "firstaid", "optional-crossing-point": "crossing", "forbidden-route": "forbidden", "registration-mark": "regmark", "out-of-bounds": "oob",
  "dangerous-area": "danger", "temporary-construction": "construction", "white-out": "whiteout", rectangle: "rect" };
const SPECIAL_TIP = (k) => (["text", "image", "rectangle", "ellipse"].includes(k) ? t("trc.rib.spTipFrame")
  : ["boundary", "line"].includes(k) ? t("trc.rib.spTipLine")
    : ["out-of-bounds", "dangerous-area", "temporary-construction", "white-out"].includes(k) ? t("trc.rib.spTipArea") : t("trc.rib.spTipPoint"));
const ACT_ICON_OF = (act) => ACT_ICON[act] || "dots";
