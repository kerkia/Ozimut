// The Tracer's editor (Organisation › Tracer): one window over the site — the course tabs and tools along the top, the
// description sheet and the selected object's details on the left, the map with the course in the middle, a help line
// at the bottom — that works as Purple Pen does (click to select, drag a selected object to move it, drag elsewhere to
// pan, the wheel to zoom; a new control goes after the selected control, into the selected leg, or into the closest leg).
// Every change goes through change(): a snapshot for undo (100 steps), a new layout, a redraw, and a save a moment later
// (the event's version guards against two people saving over each other; a lock tells the team who is editing).
// One interface, the ribbon (ribbon.js, ribbon-data.js; owner, 2026-10-17 — the Purple Pen menus retired on 2026-10-24), at two
// levels: the essential one and the advanced one (Condes's features, E.pro), both every account's since 2026-11-08 (owner; the
// advanced level was the administrators' from 2026-10-24); its buttons keep their orange dot.

import * as M from "./model.js";
import { layoutCourse, distFrom } from "./layout.js";
import { itemsFor, drawItems, tracePath, SCREEN, cmykToRgb } from "./draw.js";
import * as S from "./store.js";
import { loadSymbols, loadAllTexts, languageStrings, setCustomSymbols } from "./symbols.js";
import { loadFonts, ensureText, setLanguage } from "./fonts.js";
import * as OFF from "./offline.js";
import * as FW from "../fullwin.js";
import { bar } from "../waitbar.js";
import { descPane } from "./panes.js";
import * as A from "./actions.js";
import * as D from "./dialogs.js";
import { syncMap, splitItems, itemBlend, purpleOverride } from "./appear.js";
import { isMapFile } from "./mapsrc.js";
import { isOcnFile } from "./ocnfile.js";
import { svg } from "./icons.js";
import { insetSrc } from "./layoutx.js";
import { mapOf, drawExtra, loadExtraMaps, templatesOf } from "./maps.js";
import { mountRibbon } from "./ribbon.js";
import { paintRoutes, paceOf } from "./routedraw.js";
import * as auth from "../auth.js";
import { t, tn, locale } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const TOOLS = [["select", t("trc.ed.toolSelect"), t("trc.ed.helpSelect")],
  ["start", t("trc.ed.toolStart"), t("trc.ed.helpStart")],
  ["control", t("trc.ed.toolControl"), t("trc.ed.helpControl")],
  ["finish", t("trc.ed.toolFinish"), t("trc.ed.helpFinish")],
  ["crossing", t("trc.ed.toolCrossing"), t("trc.ed.helpCrossing")],
  ["issue", t("trc.ed.toolIssue"), t("trc.ed.helpIssue")],
  ["exchange", t("trc.ed.toolExchange"), t("trc.ed.helpExchange")],
  ["bend", t("trc.ed.toolBend"), t("trc.ed.helpBend")],
  ["gap", t("trc.ed.toolGap"), t("trc.ed.helpGap")],
  ["route", t("trc.ed.toolRoute"), t("trc.ed.helpRoute")],
  ["descr", t("trc.ed.toolDescr"), t("trc.ed.helpDescr")]];

/** Open the editor over the page. ctx: { meta, role, you, ev, version, mapSrc, key, readOnly, lockHolder, onClose, newTab, blank, onStart }.
 *  blank: no event yet (the page opens the editor at once, its start screen over it — owner, 2026-10-17): nothing saved, no
 *  lock, every change and most menus lead to the start screen. onStart(kind, files): the start screen (pages/tracer.js). */
export async function openEditor(ctx) {
  // the symbols, and the fonts the labels are measured with (Helvetica's widths stand in when they are slow to come)
  const fontsIn = await Promise.all([loadSymbols(), loadFonts(5000)]).then(([, ok]) => ok);
  const E = {
    meta: ctx.meta, role: ctx.role, you: ctx.you, ev: ctx.ev, version: ctx.version || 0, key: ctx.key || null, map: ctx.mapSrc,
    lent: !!ctx.lent,                                     // the map lent to this member: no print or export of it (dialogs.js LENT_BLOCK)
    localDem: ctx.dem || null,                            // the elevation model of the copy kept on this device (offline.js), for relief.js
    readOnly: !!ctx.readOnly || !!ctx.blank, lockHolder: ctx.lockHolder || null, offline: !!ctx.offline, blank: !!ctx.blank, onStart: ctx.onStart || null,
    cd: M.cdAll(), variation: null, sel: null, tool: "select", undo: [], redo: [], dirty: false, saving: false, lastSaved: null,
    opts: { intensity: loadPref("intensity", 1), allControls: loadPref("allControls", false), others: [], printArea: false, autoDesc: loadPref("autoDesc", true) !== false },
    layout: null, items: [], view: { k: 1, ox: 0, oy: 0 }, pending: null,
    overlays: [], closeHooks: [], pickOnce: null, rev: 0,
    pro: true,                                            // the advanced level: every account's since 2026-11-08 (owner)
  };
  window.__tracer = E;                                   // for support and scripted checks
  const root = document.createElement("div");
  root.className = `tr-app${E.pro ? " tr-pro" : ""}`;
  root.setAttribute("role", "application");
  root.innerHTML = shell(E);
  // in the page under the site's menus, as the analyses (owner, 2026-10-15): ⤢ fills the window, ↗ moves it to a tab
  (ctx.container || document.body).appendChild(root);
  document.body.classList.add("tr-open");
  FW.bindFull();
  if (FW.inOwnTab()) FW.setFull(true);
  E.root = root;
  const $ = (s) => root.querySelector(s), $$ = (s) => [...root.querySelectorAll(s)];
  E.$ = $; E.$$ = $$;
  const canvas = $("#tr-map"), g = canvas.getContext("2d");
  E.canvas = canvas;

  // ---- helpers exposed to the other modules -----------------------------------------------------------------------
  // a busy state with its bar: the share done when the caller knows it (frac), else an hourglass (owner, 2026-11-01)
  E.status = (msg, kind = "", frac = null) => { const s = $("#tr-status"); s.innerHTML = `${kind === "busy" ? bar(frac) : ""}${esc(msg)}`; s.dataset.kind = kind; };
  E.help = (msg) => { $("#tr-help").textContent = msg || toolHelp(E.tool); };
  E.toast = (msg, ms = 3500) => {
    const el = document.createElement("div"); el.className = "tr-toast"; el.textContent = msg; root.appendChild(el);
    setTimeout(() => el.remove(), ms);
  };
  E.course = () => (E.cd.course ? E.ev.courses[E.cd.course] : null);
  /** Apply a change: snapshot for undo, then fn(ev); a refused change (fn returns false) is not kept. */
  E.change = (fn, label = "") => {
    if (E.blank) { E.toast(t("trc.ed.needEvent")); E.onStart?.(); return false; }
    if (E.readOnly) { E.toast(t("trc.ed.readOnlyOther")); return false; }
    const snap = JSON.stringify(E.ev);
    let ok;
    try { ok = fn(E.ev); if (ok !== false) M.syncDerived(E.ev); } catch (err) { console.error(err); E.ev = JSON.parse(snap); E.toast(t("trc.ed.changeErr", { err: err.message })); return false; }
    if (ok === false) { E.ev = JSON.parse(snap); return false; }
    E.undo.push({ snap, label }); if (E.undo.length > 100) E.undo.shift();
    E.redo = [];
    afterChange();
    return true;
  };
  E.undoStep = () => {
    const u = E.undo.pop(); if (!u) return;
    E.redo.push({ snap: JSON.stringify(E.ev), label: u.label });
    E.ev = JSON.parse(u.snap); fixSelection(); afterChange();
    E.help(u.label ? t("trc.ed.undoneWhat", { what: u.label }) : t("trc.ed.undone"));
  };
  E.redoStep = () => {
    const r = E.redo.pop(); if (!r) return;
    E.undo.push({ snap: JSON.stringify(E.ev), label: r.label });
    E.ev = JSON.parse(r.snap); fixSelection(); afterChange();
    E.help(r.label ? t("trc.ed.redoneWhat", { what: r.label }) : t("trc.ed.redone"));
  };
  E.select = (sel) => { E.sel = sel; refresh(); };
  E.setTool = (t) => {
    E.tool = t; E.pending = null;
    $$("[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === t || (t.startsWith("special:") && b.dataset.tool === "special"))));
    canvas.dataset.tool = t.split(":")[0];
    E.help(); draw();
    E.ribbon?.update();
  };
  /** A line, an area or a route being drawn, given up (Échap, the ribbon's « Annuler »). */
  E.cancelPending = () => { E.pending = null; E.ghost = null; if (E.tool !== "select") E.setTool("select"); else { E.help(); draw(); E.ribbon?.update(); } };
  E.setIntensity = (v) => { E.opts.intensity = v; savePref("intensity", v); const r = $("#tr-intensity"); if (r) r.value = String(v); draw(); };
  E.setCourse = (courseId, part = -1, path = null) => {
    E.cd = courseId ? M.cdCourse(courseId, part, path) : M.cdAll();
    E.variation = null;
    if (E.sel?.kind === "leg" || E.sel?.kind === "control" && E.sel.cc) E.sel = null;
    renderTabs(); refresh();
    E.syncMap?.();                                                  // the course's own training map (M.mapHideFor)
  };
  E.refresh = () => refresh();
  E.redraw = () => draw();
  E.fitCourse = () => fitCourse();
  E.save = () => save(true);
  E.close = () => close();
  E.toMap = (sx, sy) => [(sx - E.view.ox) / E.view.k, (E.view.oy - sy) / E.view.k];
  E.toScreen = (x, y) => [E.view.ox + x * E.view.k, E.view.oy - y * E.view.k];

  function afterChange() {
    E.dirty = true; E.rev++;
    renderTabs(); refresh();
    scheduleSave();
    fontCheck();
    syncVector();
  }
  // an OCAD or Mapper map drawn as the event says: cut at the lower purple's layer, its overprint colours blended (appear.js)
  let syncing = Promise.resolve();
  function syncVector() {
    if (E.map?.kind !== "vector") return syncing;
    const map = E.map;
    syncing = syncing.then(() => syncMap(E.ev, map, E.cd.course || 0)).then((changed) => { if (changed && E.map === map) { sharp = null; draw(); } }).catch((err) => console.error(err));
    return syncing;
  }
  E.syncMap = syncVector;
  // every language's characters (fonts.js): the font subsets the event's texts and its description language need, loaded as
  // they appear; the sheet and the map are laid out again when they come in
  let fontTimer = null;
  function fontCheck() {
    clearTimeout(fontTimer);
    fontTimer = setTimeout(async () => {
      const lang = E.ev.lang || "fr";
      setLanguage(lang);
      if (!["fr", "en"].includes(lang)) await loadAllTexts().catch(() => null);
      const strings = [];
      const walk = (v, k) => {
        if (typeof v === "string") { if (k !== "data" && v.length < 4000) strings.push(v); }
        else if (Array.isArray(v)) for (const x of v) walk(x);
        else if (v && typeof v === "object") for (const [kk, x] of Object.entries(v)) walk(x, kk);
      };
      walk(E.ev);
      const italic = Object.values(E.ev.specials || {}).some((sp) => sp.font?.italic);
      const fresh = await ensureText([...strings, ...languageStrings(lang)], { italic }).catch(() => false);
      if (fresh && document.body.contains(root)) refresh();
    }, 300);
  }
  const onFonts = () => { if (document.body.contains(root)) refresh(); };
  window.addEventListener("tr-fonts", onFonts);
  E.closeHooks.push(() => { window.removeEventListener("tr-fonts", onFonts); clearTimeout(fontTimer); });
  function fixSelection() {
    if (E.cd.course && !E.ev.courses[E.cd.course]) { E.cd = M.cdAll(); E.variation = null; }   // a course undone or deleted
    if (E.variation && !(E.cd.course && M.hasVariations(E.ev, E.cd.course))) E.variation = null;
    const s = E.sel; if (!s) return;
    if ((s.kind === "control" || s.kind === "number") && !E.ev.controls[s.control]) E.sel = null;
    if (s.kind === "special" && !E.ev.specials[s.id]) E.sel = null;
    if (s.kind === "leg" && (!E.ev.controls[s.c1] || !E.ev.controls[s.c2])) E.sel = null;
  }
  /** Layout, items, panes, then the drawing. */
  function refresh() {
    fixSelection();
    setCustomSymbols(E.ev.symbols);
    const cdDraw = E.cd.course && M.hasVariations(E.ev, E.cd.course) && E.variation ? { ...E.cd, path: E.variation.path } : E.cd;
    E.cdDraw = cdDraw;
    E.layout = layoutCourse(E.ev, cdDraw, { variationName: E.variation?.code || "" });
    E.items = itemsFor(E.ev, E.layout, { selected: selKey(E.sel) });
    E.others = othersLayer();
    descPane(E);
    infoPane();
    renderVariations();
    $("#tr-undo").disabled = !E.undo.length || E.readOnly;
    $("#tr-redo").disabled = !E.redo.length || E.readOnly;
    draw();
    E.ribbon?.update();
    E.ra?.onRefresh?.();                                   // the route analyzer's panel follows the course and its routes
  }
  const selKey = (s) => !s ? null : s.kind === "leg" ? { leg: [s.c1, s.c2] } : s.kind === "special" ? { special: s.id } : s.kind === "control" ? { control: s.control } : null;
  /** The other controls (light purple) while adding, or when « tous les postes » is on; other courses' outlines. */
  function othersLayer() {
    const out = [];
    // other courses chosen under Affichage › Autres circuits, faint
    const oc = [];
    for (const id of E.opts.others || []) if (id !== E.cd.course && E.ev.courses[id]) oc.push(...layoutCourse(E.ev, M.cdCourse(id), { specials: false, descriptions: false }).objs.filter((o) => o.t !== "descriptions"));
    E.otherCourseItems = oc.length ? itemsFor(E.ev, { objs: oc }) : [];
    const show = E.opts.allControls || ["control", "start", "finish", "crossing", "issue"].includes(E.tool);
    if (show && E.cd.course) {
      const used = new Set(M.ccIds(E.ev, E.cd).map((id) => E.ev.courseControls[id].control));
      const all = layoutCourse(E.ev, M.cdAll(), { numbers: true, specials: false, descriptions: false });
      for (const o of all.objs) if ((o.control && !used.has(o.control)) || (o.t === "code" && !used.has(o.control))) out.push(o);
      E.othersObjs = out;
      return itemsFor(E.ev, { objs: out });
    }
    E.othersObjs = [];
    return [];
  }

  // ---- the map view ------------------------------------------------------------------------------------------------
  const dpr = () => window.devicePixelRatio || 1;
  let sharp = null, sharpTimer = null, sharpCtl = null;            // a PDF or vector map rendered sharp for the current view
  function fitHeight() {
    const top = root.getBoundingClientRect().top + window.scrollY;
    root.style.height = `${Math.max(420, Math.floor(window.innerHeight - top - 8))}px`;
  }
  E.fitHeight = fitHeight;
  function size() {
    fitHeight();
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr())); canvas.height = Math.max(1, Math.round(r.height * dpr()));
    if ((E.needFit || !(E.view.k > 0)) && r.width > 70 && r.height > 70) { fitCourse(); return; }
    draw();
  }
  const mapPxPerMm = () => (E.map ? E.map.pxW / E.ev.map.w : 1);
  function draw() {
    const W = canvas.width / dpr(), H = canvas.height / dpr();
    g.setTransform(dpr(), 0, 0, dpr(), 0, 0);
    g.fillStyle = "#f4f3ee"; g.fillRect(0, 0, W, H);
    const v = E.view;
    const T = (x, y) => [v.ox + x * v.k, v.oy - y * v.k];
    const pc = purpleOverride(E.ev, E.map), purple = pc ? cmykToRgb(pc) : SCREEN.upper, blend = itemBlend(E.ev, E.map);
    // another map of the event for this course part (the advanced level: maps.js), placed by its affine
    const other = E.ev.maps ? mapOf(E, E.cdDraw || E.cd) : null;
    // « layer » mode (Purple Pen): the map up to the lower purple's colour, the lower purple, the rest of the map, the rest
    const layered = !other && E.map?.kind === "vector" && E.map.layer != null && !!E.map.images;
    if (other) drawExtra(g, T, v.k, other, E.opts.intensity);
    else if (E.map) drawMap(v, layered ? "below" : "all");
    // an OCAD map's templates given to the event (mapview.js), half transparent over the map
    if (!other && E.ev.maps) for (const tp of templatesOf(E)) drawExtra(g, T, v.k, tp, 0.5);
    else { g.strokeStyle = "#c9c6bb"; g.strokeRect(v.ox, v.oy - (E.ev.map.h || 297) * v.k, (E.ev.map.w || 210) * v.k, (E.ev.map.h || 297) * v.k); }
    // « Fonds et relief » (backdrop.js): online layers and the relief over the map, under the course
    E.backdrop?.paint(g, T, W, H);
    let items = E.items;
    if (layered) {
      const [lower, rest] = splitItems(items);
      drawItems(g, lower, T, v.k, { blend, purple });
      drawMap(v, "above");
      items = rest;
    }
    if (E.otherCourseItems?.length) drawItems(g, E.otherCourseItems, T, v.k, { blend, purple: "#7b8fb3", alpha: 0.55 });
    if (E.others?.length) drawItems(g, E.others, T, v.k, { blend, purple: "#d9a6d4", alpha: 0.9 });
    drawItems(g, items, T, v.k, { blend, purple, onInset: (it) => drawInset(it, T, v.k, { blend, purple }) });
    if (E.opts.printArea) drawPrintArea(T);
    drawRoutes(T);
    for (const f of E.overlays) { try { f(g, T, v.k); } catch (err) { console.error(err); } }
    drawHandles(T);
    if (E.ghost) drawGhost(T);
    if (E.dragRect) { g.strokeStyle = "#0a84ff"; g.setLineDash([5, 4]); const [x1, y1] = T(...E.dragRect[0]), [x2, y2] = T(...E.dragRect[1]); g.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)); g.setLineDash([]); }
    scheduleSharp();
    // a shape being drawn: the ribbon's « Tracé en cours » tab follows its points
    const pk = E.pending ? `${E.pending.kind}:${E.pending.pts.length}` : "";
    if (E.ribbon && pk !== E.ribbon.pk) { E.ribbon.pk = pk; E.ribbon.update(); }
  }
  /** The map, or a part of a vector map's colours ("below", "above": transparent where the part draws nothing). */
  function drawMap(v, part) {
    const W = canvas.width / dpr(), H = canvas.height / dpr(), s = v.k / mapPxPerMm();
    const vec = part !== "all";
    g.save();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    if (part === "above") g.globalAlpha = E.opts.intensity;          // the upper colours fade toward what lies under them
    // zoomed out, a reduced copy of a large image (mapsrc.withLevels): the coarsest still as fine as the screen
    let img = vec ? E.map.images[part] : E.map.image;
    for (const l of (vec ? E.map.images.levels?.[part] : E.map.levels) || []) if (l.k >= s * dpr()) img = l.image;
    const sc = sharp && sharp.map === E.map && sharp.k === v.k && sharp.layer === (E.map.layer ?? null) && sharp.over === !!E.map.overprint ? sharp.parts[part] : null;
    const [sx, sy] = sc ? E.toScreen(sharp.box[0], sharp.box[3]) : [0, 0], sw = sc ? sc.width / dpr() : 0, sh = sc ? sc.height / dpr() : 0;
    if (sc && part === "above") { g.save(); g.beginPath(); g.rect(0, 0, W, H); g.rect(sx, sy, sw, sh); g.clip("evenodd"); }
    g.drawImage(img, v.ox, v.oy - E.ev.map.h * v.k, E.map.pxW * s, E.map.pxH * s);
    if (sc && part === "above") g.restore();
    if (sc) g.drawImage(sc, sx, sy, sw, sh);
    if (part !== "above" && E.opts.intensity < 1) { g.globalAlpha = 1; g.fillStyle = `rgba(255,255,255,${1 - E.opts.intensity})`; g.fillRect(v.ox, v.oy - E.ev.map.h * v.k, E.ev.map.w * v.k, E.ev.map.h * v.k); }
    g.restore();
  }
  /** An enlarged section of the map (the advanced level): the map and the course again, magnified, clipped to its frame. */
  function drawInset(it, T, k, opts) {
    const src = insetSrc(it), f = it.factor, [l, b, r, t] = it.box;
    const T2 = (x, y) => T(l + (x - src[0]) * f, b + (y - src[1]) * f);
    const [x0, y0] = T(l, t), [x1, y1] = T(r, b);
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    if (E.map?.image) {
      const [mx, my] = T2(0, E.ev.map.h), [mx2, my2] = T2(E.ev.map.w, 0);
      g.globalAlpha = E.opts.intensity; g.drawImage(E.map.image, mx, my, mx2 - mx, my2 - my); g.globalAlpha = 1;
    }
    drawItems(g, E.items.filter((x) => !x.desc && x.t !== "inset" && !x.insetFrame), T2, k * f, opts);
    g.restore();
  }
  /** The legs' routes (routedraw.js: computed by the route analyzer or drawn by hand), with their labels, on the screen only. */
  function drawRoutes(T) {
    const legs = (E.layout?.objs || []).filter((o) => o.t === "leg").map((o) => [o.control, o.control2]);
    if (!legs.length) return;
    paintRoutes(g, T, E.ev, legs, { labels: loadPref("raLabels", "main"), pace: paceOf(E.ev, E.cd.course), lit: E.ra?.lit || null,
      sel: E.sel?.kind === "leg" ? [E.sel.c1, E.sel.c2] : null, nf: (v) => new Intl.NumberFormat(locale()).format(v) });
  }
  function drawPrintArea(T) {
    const pa = M.printAreaOf(E.ev, E.cdDraw || E.cd);
    if (!pa?.rect) return;
    const [l, b, r, t] = pa.rect, [x1, y1] = T(l, t), [x2, y2] = T(r, b);
    g.save(); g.strokeStyle = "#555"; g.setLineDash([8, 5]); g.lineWidth = 1.5; g.strokeRect(x1, y1, x2 - x1, y2 - y1); g.restore();
  }
  /** Handles of the selected object: bends, gap ends, special corners, the description sheet's corner. */
  function drawHandles(T) {
    const hs = A.handles(E);
    g.save();
    for (const h of hs) {
      const [x, y] = T(...h.pt);
      g.fillStyle = "#fff"; g.strokeStyle = "#0a84ff"; g.lineWidth = 1.5;
      g.beginPath(); h.round ? g.arc(x, y, 4.5, 0, Math.PI * 2) : g.rect(x - 4, y - 4, 8, 8); g.fill(); g.stroke();
    }
    g.restore();
  }
  function drawGhost(T) {
    const gh = E.ghost;
    g.save(); g.globalAlpha = 0.65;
    if (gh.items) drawItems(g, gh.items, T, E.view.k, { blend: "none", purple: "#0a84ff" });
    if (gh.pts?.length) {
      g.strokeStyle = "#0a84ff"; g.lineWidth = 2; g.setLineDash([6, 4]); g.beginPath();
      gh.pts.forEach((p, i) => { const [x, y] = T(...p); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      if (gh.cursor) g.lineTo(...T(...gh.cursor));
      if (gh.closed) g.closePath();
      g.stroke();
      // a control being placed by a drag: its circle, and an arrow to the side where the flag stands, named
      if (gh.ring) {
        const [x0, y0] = T(...gh.pts[0]), [x1, y1] = T(...gh.pts[gh.pts.length - 1]), a = Math.atan2(y1 - y0, x1 - x0);
        g.setLineDash([]); g.globalAlpha = 0.9;
        g.beginPath(); g.arc(x0, y0, gh.ring * E.view.k, 0, 2 * Math.PI); g.stroke();
        if (Math.hypot(x1 - x0, y1 - y0) > 8) {
          g.fillStyle = "#0a84ff"; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - 11 * Math.cos(a - 0.4), y1 - 11 * Math.sin(a - 0.4)); g.lineTo(x1 - 11 * Math.cos(a + 0.4), y1 - 11 * Math.sin(a + 0.4)); g.closePath(); g.fill();
          if (gh.label) {
            g.font = "600 12px system-ui, sans-serif"; const w = g.measureText(gh.label).width + 10, lx = x1 + 14 * Math.cos(a) - w / 2, ly = y1 + 14 * Math.sin(a) - 9;
            g.fillStyle = "rgba(255, 255, 255, 0.92)"; g.fillRect(lx, ly, w, 18); g.fillStyle = "#0a4fa0"; g.textBaseline = "middle"; g.fillText(gh.label, lx + 5, ly + 9.5);
          }
        }
      }
    }
    g.restore();
  }
  // a PDF or vector map drawn sharp at high zoom: the visible part rendered at the screen's resolution after the view settles
  function scheduleSharp() {
    if (!E.map?.renderRegion) return;
    clearTimeout(sharpTimer);
    const need = E.view.k * dpr() > mapPxPerMm() * 1.15;
    if (!need) { sharp = null; return; }
    const layer = E.map.kind === "vector" ? E.map.layer ?? null : null, over = !!E.map.overprint;
    if (sharp && sharp.map === E.map && sharp.k === E.view.k && sharp.ox === E.view.ox && sharp.oy === E.view.oy && sharp.layer === layer && sharp.over === over) return;
    sharpTimer = setTimeout(async () => {
      sharpCtl?.abort(); sharpCtl = new AbortController();
      const W = canvas.width / dpr(), H = canvas.height / dpr();
      const [l, t] = E.toMap(0, 0), [r, b] = E.toMap(W, H);
      const box = [Math.max(0, l), Math.max(0, b), Math.min(E.ev.map.w, r), Math.min(E.ev.map.h, t)];
      if (box[2] <= box[0] || box[3] <= box[1]) return;
      const k = E.view.k, v0 = { ...E.view }, map = E.map, sig = sharpCtl.signal;
      try {
        const parts = layer != null && map.images
          ? { below: await map.renderRegion(box, k * dpr(), sig, "below"), above: await map.renderRegion(box, k * dpr(), sig, "above") }
          : { all: await map.renderRegion(box, k * dpr(), sig) };
        if (map === E.map && !sig.aborted && E.view.k === v0.k && E.view.ox === v0.ox && E.view.oy === v0.oy) { sharp = { parts, box, k, ox: v0.ox, oy: v0.oy, layer, over, map }; draw(); }
      } catch (err) { /* cancelled */ }
    }, 260);
  }
  function fitBox([l, b, r, t], pad = 30) {
    const W = canvas.width / dpr(), H = canvas.height / dpr();
    if (W < 2 * pad + 10 || H < 2 * pad + 10) { E.needFit = true; return; }      // no room yet (a hidden tab): fitted on the next size()
    E.needFit = false;
    const k = Math.min((W - 2 * pad) / Math.max(5, r - l), (H - 2 * pad) / Math.max(5, t - b));
    E.view = { k, ox: W / 2 - ((l + r) / 2) * k, oy: H / 2 + ((b + t) / 2) * k };
  }
  function fitCourse() {
    const v = E.layout?.view;
    if (v && v.controls.length) fitBox(M.viewBounds(E.ev, v));
    else fitBox([0, 0, E.ev.map.w || 210, E.ev.map.h || 297], 10);
    draw();
  }
  E.fitMap = () => { fitBox([0, 0, E.ev.map.w || 210, E.ev.map.h || 297], 10); draw(); };
  E.fitBox = (box, pad = 30) => { fitBox(box, pad); draw(); };
  function zoomAt(f, sx, sy) {
    const W = canvas.width / dpr(), H = canvas.height / dpr();
    if (sx == null) { sx = W / 2; sy = H / 2; }
    const [x, y] = E.toMap(sx, sy);
    const k = Math.max(0.05, Math.min(400, E.view.k * f));
    E.view = { k, ox: sx - x * k, oy: sy + y * k };
    $("#tr-zoom").textContent = t("trc.ed.zoomPct", { n: Math.round((k / (96 / 25.4)) * 100) });
    draw();
  }
  E.zoomAt = zoomAt;

  // ---- hit testing ---------------------------------------------------------------------------------------------------
  /** The object under a screen point: { kind, … } for selection; within 6 px. */
  function hitAt(sx, sy, { includeOthers = false } = {}) {
    const p = E.toMap(sx, sy), tol = 7 / E.view.k;
    let best = null, bestD = Infinity, bestPri = -1;
    const consider = (o, pri) => {
      let d;
      if (o.t === "control" || o.t === "finish") d = Math.max(0, M.dist(p, o.ctr) - (o.radius || 0));
      else d = distFrom(o, p);
      if (o.t === "descriptions") d = o.box && p[0] >= o.box[0] && p[0] <= o.box[2] && p[1] >= o.box[1] && p[1] <= o.box[3] ? 0 : Infinity;
      if (d <= tol && (pri > bestPri || (pri === bestPri && d < bestD))) { best = o; bestD = d; bestPri = pri; }
    };
    for (const o of E.layout.objs) {
      const pri = o.t === "number" || o.t === "code" ? 5 : ["control", "finish", "start", "crossing", "issue"].includes(o.t) && o.control ? 4
        : o.t === "leg" ? 3 : o.t === "descriptions" ? 1 : o.special ? 2 : 0;
      consider(o, pri);
    }
    if (includeOthers) for (const o of E.othersObjs || []) if (o.control) consider({ ...o, other: true }, o.t === "code" ? 0 : 6);
    if (!best) return null;
    if (best.other) return { kind: "control", control: best.control, cc: 0, other: true };
    if (best.t === "number" || best.t === "code") return { kind: "number", control: best.control, cc: best.cc };
    if (best.t === "leg") return { kind: "leg", c1: best.control, c2: best.control2, cc1: best.cc, cc2: best.cc2 };
    if (best.special) return { kind: "special", id: best.special };
    if (best.control) return { kind: "control", control: best.control, cc: best.cc };
    return null;
  }
  E.hitAt = hitAt;

  // ---- pointer -----------------------------------------------------------------------------------------------------
  let drag = null;
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    canvas.focus({ preventScroll: true });
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    const sx = e.offsetX, sy = e.offsetY, p = E.toMap(sx, sy);
    if (e.button === 2) { drag = { kind: "pan", sx, sy, ox: E.view.ox, oy: E.view.oy, moved: false, right: true }; return; }
    if (e.button === 1) { drag = { kind: "pan", sx, sy, ox: E.view.ox, oy: E.view.oy, moved: false }; return; }
    // a command waits for a point (the ribbon's « Ajouter un coude », « Couper le cercle »…): the click is for it
    if (E.pickOnce) { drag = { kind: "pan", sx, sy, ox: E.view.ox, oy: E.view.oy, moved: false, click: true }; return; }
    // a tool that draws by dragging
    if (!E.readOnly && E.tool !== "select") {
      const d = A.toolDown(E, p, sx, sy, e);
      if (d) { drag = { ...d, sx, sy, moved: false }; return; }
    }
    // a handle of the selected object, or the selected object itself, is dragged; elsewhere the map pans
    if (E.tool === "select" && !E.readOnly) {
      const h = A.handleAt(E, sx, sy);
      if (h) { drag = { kind: "handle", handle: h, sx, sy, moved: false, start: p }; return; }
      const hit = hitAt(sx, sy);
      if (hit && E.sel && sameSel(hit, E.sel) && A.movable(E, hit)) { drag = { kind: "move", hit, sx, sy, start: p, moved: false }; return; }
    }
    drag = { kind: "pan", sx, sy, ox: E.view.ox, oy: E.view.oy, moved: false, click: true };
  });
  canvas.addEventListener("pointermove", (e) => {
    const sx = e.offsetX, sy = e.offsetY, p = E.toMap(sx, sy);
    $("#tr-pos").textContent = `${p[0].toFixed(1)}, ${p[1].toFixed(1)} mm`;
    if (!drag) { A.hover(E, p, sx, sy); return; }
    if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) drag.moved = true;
    if (!drag.moved) return;
    if (drag.kind === "pan") { E.view = { ...E.view, ox: drag.ox + sx - drag.sx, oy: drag.oy + sy - drag.sy }; draw(); }
    else A.dragMove(E, drag, p, sx, sy, e);
  });
  const up = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    const sx = e.offsetX, sy = e.offsetY, p = E.toMap(sx, sy);
    if (d.kind === "pan") {
      if (!d.moved && d.right) { A.contextMenu(E, sx, sy, e.clientX, e.clientY); return; }
      if (!d.moved && d.click && E.pickOnce) { const f = E.pickOnce; E.pickOnce = null; E.help(); f(p); return; }
      if (!d.moved && d.click) A.click(E, p, sx, sy, e);
      return;
    }
    A.dragEnd(E, d, p, sx, sy, e);
  };
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", () => { drag = null; E.ghost = null; draw(); });
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); zoomAt(Math.exp(-e.deltaY * 0.0015), e.offsetX, e.offsetY); }, { passive: false });
  canvas.addEventListener("dblclick", (e) => { if (A.doubleClick(E, E.toMap(e.offsetX, e.offsetY), e.offsetX, e.offsetY)) return; zoomAt(1.6, e.offsetX, e.offsetY); });
  const sameSel = (a, b) => a.kind === b.kind && (a.kind === "special" ? a.id === b.id : a.kind === "leg" ? a.c1 === b.c1 && a.c2 === b.c2 : a.control === b.control);

  // ---- keyboard ----------------------------------------------------------------------------------------------------
  function onKey(e) {
    if (!document.body.contains(root)) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
    if (e.target.closest?.("[data-own-keys]") && !e.ctrlKey && !e.metaKey) return;      // the description sheet's own keys (panes.js)
    if (root.querySelector(".tr-modal")) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); E.undoStep(); }
    else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); E.redoStep(); }
    else if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(true); }
    else if (e.key === "Enter" && E.pending) { e.preventDefault(); A.finishPending(E); }
    else if (e.key === "Delete" || e.key === "Backspace") { if (E.sel) { e.preventDefault(); A.deleteSelection(E); } }
    else if (e.key === "Escape") {
      if (E.pickOnce) { E.pickOnce = null; const c = E.pickCancel; E.pickCancel = null; c?.(); E.help(); }
      else if (E.pending) E.cancelPending();
      else if (E.tool !== "select") E.setTool("select");
      else if (E.sel) E.select(null);
      else if (FW.isFull() && !FW.inOwnTab()) FW.setFull(false);
    }
    else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const step = 60, dx = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0, dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
      E.view = { ...E.view, ox: E.view.ox + dx, oy: E.view.oy + dy }; draw();
    } else if (e.key === "+" || e.key === "=") zoomAt(1.25);
    else if (e.key === "-") zoomAt(0.8);
    else if (!mod && !e.altKey) {
      const k = { s: "select", p: "control", d: "start", a: "finish", o: "crossing", c: "bend", x: "gap" }[e.key.toLowerCase()];
      if (k && !E.readOnly) E.setTool(k);
    }
  }
  document.addEventListener("keydown", onKey);

  // ---- tabs, toolbar, menus ----------------------------------------------------------------------------------------
  function renderTabs() {
    const ids = M.courseIds(E.ev);
    $("#tr-tabs").innerHTML = [`<button type="button" role="tab" data-course="0" aria-selected="${!E.cd.course}">${esc(t("trc.ed.allControls"))}</button>`,
      ...ids.map((id) => `<button type="button" role="tab" data-course="${id}" aria-selected="${E.cd.course === id}" title="${esc(courseTip(id))}">${esc(E.ev.courses[id].name || t("trc.ed.course"))}</button>`),
      E.readOnly ? "" : `<button type="button" class="tr-tab-add" data-act="course-new" title="${esc(t("trc.ed.newCourse"))}">${svg("plus", 15)}</button>`].join("");
    $$("#tr-tabs [data-course]").forEach((b) => b.addEventListener("click", () => E.setCourse(Number(b.dataset.course))));
    const parts = E.cd.course ? M.countParts(E.ev, { ...E.cd, part: -1, path: E.variation?.path || null }) : 1;
    const pbox = $("#tr-parts");
    pbox.hidden = parts < 2;
    if (parts >= 2) pbox.innerHTML = [`<button type="button" data-part="-1" aria-pressed="${E.cd.part < 0}">${esc(t("trc.ed.allParts"))}</button>`,
      ...Array.from({ length: parts }, (_, i) => `<button type="button" data-part="${i}" aria-pressed="${E.cd.part === i}">${esc(t("trc.ed.partN", { n: i + 1 }))}</button>`)].join("");
    $$("#tr-parts [data-part]").forEach((b) => b.addEventListener("click", () => { E.cd = { ...E.cd, part: Number(b.dataset.part) }; renderTabs(); refresh(); }));
    root.querySelector(".tr-title").textContent = E.blank ? t("trc.ed.noEventOpen") : E.ev.title || E.meta.title;
  }
  const courseTip = (id) => {
    const v = M.view(E.ev, M.cdCourse(id), { specials: false, descriptions: false });
    return tn("trc.ed.courseTip", v.minNormal, { km: new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v.totalMin / 1000) });
  };
  function renderVariations() {
    const box = $("#tr-vars");
    const has = E.cd.course && M.hasVariations(E.ev, E.cd.course);
    box.hidden = !has;
    if (!has) return;
    const vars = M.allVariations(E.ev, E.cd.course);
    box.innerHTML = `<label>${esc(t("trc.ed.variation"))} <select id="tr-var"><option value="">${esc(t("trc.ed.allVariations"))}</option>${vars.map((v) => `<option value="${esc(v.code)}" ${E.variation?.code === v.code ? "selected" : ""}>${esc(v.code)}</option>`).join("")}</select></label>`;
    box.querySelector("#tr-var").addEventListener("change", (ev) => {
      E.variation = vars.find((v) => v.code === ev.target.value) || null;
      E.sel = null; refresh();
    });
  }
  // the selected object's pane: its details are in its contextual tab, the pane shows the course
  function infoPane() { const el = $("#tr-info"); el.hidden = !!E.sel; el.innerHTML = A.describeSelection(E); A.bindInfo(E, el); }

  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    e.preventDefault();
    D.action(E, b.dataset.act, b);
  });
  $("#tr-undo").addEventListener("click", () => E.undoStep());
  $("#tr-redo").addEventListener("click", () => E.redoStep());
  // « Événements »: the start screen (open, create, import); without one (an older caller), back to the list
  $("#tr-close").addEventListener("click", () => (E.onStart ? E.onStart() : close()));
  // « ↗ »: the event moves to a tab of its own — the tab opened at once (a later open would be taken for a pop-up), the work
  // saved, the tab sent to the event, and the editor here closed: one event is not edited from two tabs
  FW.setTabHandler(async () => {
    const w = window.open("", "_blank");
    if (!w) { E.toast(t("trc.ed.tabBlocked")); return; }
    await save(false);
    w.location.href = `${location.origin}${location.pathname}#/orga-tracer?id=${E.meta.id}&fen=1`;
    close();
  });
  // Échap: the editor's own uses first (a pick, a tool, a selection), then out of full window
  FW.setEscapeOwner(() => document.body.contains(root) && !!(E.pickOnce || E.pending || E.tool !== "select" || E.sel || root.querySelector(".tr-modal") || E.ribbon?.ownsEscape?.()));
  FW.setBeforeClose(() => save(false));                  // « ✕ » of a tab of its own: the work saved first
  $("#tr-fit").addEventListener("click", () => fitCourse());
  $("#tr-zin").addEventListener("click", () => zoomAt(1.4));
  $("#tr-zout").addEventListener("click", () => zoomAt(1 / 1.4));
  $("#tr-intensity").value = String(E.opts.intensity);
  $("#tr-intensity").addEventListener("input", (e) => { E.setIntensity(Number(e.target.value)); E.ribbon?.render(); });
  // the left pane's width
  const split = $("#tr-split");
  split.addEventListener("pointerdown", (e) => {
    split.setPointerCapture(e.pointerId);
    const x0 = e.clientX, w0 = $(".tr-left").offsetWidth;
    const mv = (ev2) => { const w = Math.max(220, Math.min(620, w0 + ev2.clientX - x0)); root.style.setProperty("--tr-left", `${w}px`); };
    const end = () => { split.removeEventListener("pointermove", mv); split.removeEventListener("pointerup", end); savePref("left", $(".tr-left").offsetWidth); refresh(); size(); };
    split.addEventListener("pointermove", mv); split.addEventListener("pointerup", end);
  });
  const lw = loadPref("left", 0); if (lw) root.style.setProperty("--tr-left", `${lw}px`);

  // ---- saving ------------------------------------------------------------------------------------------------------
  let saveTimer = null, lastVersionAt = Date.now();
  function scheduleSave() { clearTimeout(saveTimer); E.status(t("trc.ed.stModified"), "dirty"); saveTimer = setTimeout(() => save(false), 1800); }
  async function save(explicit) {
    clearTimeout(saveTimer);
    if (E.readOnly || !E.dirty) { if (explicit) E.status(t("trc.ed.stSaved"), "ok"); return true; }
    if (E.saving) { saveTimer = setTimeout(() => save(explicit), 600); return false; }
    E.saving = true; E.status(t("trc.ed.stSaving"), "busy");
    const snapshot = JSON.parse(JSON.stringify(E.ev));
    try {
      const r = await S.saveEvent(E.meta.id, snapshot, E.key, E.version);
      E.version = r.version; E.dirty = JSON.stringify(E.ev) !== JSON.stringify(snapshot);
      E.lastSaved = new Date(); E.status(t("trc.ed.stSavedAt", { time: E.lastSaved.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" }) }), "ok");
      backup(null);
      if (E.offline) { E.offline = false; banner(); }
      OFF.clearPending(E.meta.id).catch(() => {});
      if (OFF.isKept(E.meta.id)) OFF.keepEvent(E).catch(() => {});       // the copy on this device follows
      if (Date.now() - lastVersionAt > 30 * 60e3) { lastVersionAt = Date.now(); S.saveVersion(E.meta.id, snapshot, E.key, t("trc.ed.autoVersion"), A.summaryOf(E.ev)).catch(() => {}); }
      return true;
    } catch (err) {
      if (err.status === 409) {
        E.status(t("trc.ed.stConflict"), "bad");
        D.conflict(E, err.data);
      } else if (!err.status && OFF.isKept(E.meta.id)) {
        // no network: the change waits on this device and goes when the network returns
        await OFF.savePending(E, snapshot, E.version).catch(() => {});
        if (!E.offline) { E.offline = true; banner(); }
        E.status(t("trc.ed.stOffline"), "dirty");
        saveTimer = setTimeout(() => save(false), 30000);
      } else {
        backup(snapshot);
        E.status(t("trc.ed.stNotSaved"), "bad");
        saveTimer = setTimeout(() => save(false), 15000);
      }
      return false;
    } finally { E.saving = false; }
  }
  E.saveNow = save;
  function backup(ev) {
    try { if (ev) localStorage.setItem(`ocn.tr.backup.${E.meta.id}`, JSON.stringify({ at: Date.now(), version: E.version, ev: E.key ? null : ev })); else localStorage.removeItem(`ocn.tr.backup.${E.meta.id}`); } catch (e) { /* full */ }
  }
  // the editing lock: taken at opening, refreshed every minute, released at closing
  let lockTimer = null;
  async function takeLock(force = false) {
    if (ctx.role === "viewer") { E.readOnly = true; return; }
    try {
      const r = await S.api(`/${E.meta.id}/lock`, { method: "POST", body: { force } });
      if (!r.ok) { E.readOnly = true; E.lockHolder = r.holder; banner(); return; }
      E.readOnly = false; E.lockHolder = null; banner();
      clearInterval(lockTimer);
      lockTimer = setInterval(() => S.api(`/${E.meta.id}/lock`, { method: "POST", body: {} }).then((x) => {
        if (!x.ok) { E.readOnly = true; E.lockHolder = x.holder; banner(); refresh(); }
      }).catch(() => {}), 60e3);
    } catch (err) { /* offline: edit anyway, the version check guards the save */ }
  }
  E.takeLock = async () => { await takeLock(true); refresh(); };
  function banner() {
    const b = $("#tr-banner");
    root.classList.toggle("tr-blank", E.blank);
    if (E.blank) { b.hidden = true; root.classList.add("tr-readonly"); return; }
    if (E.offline) {
      b.hidden = false;
      b.innerHTML = `<span>${esc(t("trc.ed.bannerOffline"))}</span>`;
    } else if (E.readOnly && E.lockHolder) {
      b.hidden = false;
      b.innerHTML = `<span>${esc(t("trc.ed.lockedBy", { name: E.lockHolder.name || t("trc.ed.aMember") }))}</span> <button type="button" class="btn btn-sm" data-act="take-lock">${esc(t("trc.ed.takeOver"))}</button>`;
    } else if (E.readOnly) { b.hidden = false; b.innerHTML = `<span>${esc(t("trc.ed.readOnlyViewer"))}</span>`; }
    else b.hidden = true;
    root.classList.toggle("tr-readonly", E.readOnly);
  }
  function close() {
    return save(false).finally(() => {
      clearInterval(lockTimer);
      for (const f of E.closeHooks) { try { f(); } catch (err) { /* closing anyway */ } }
      if (!E.readOnly) S.api(`/${E.meta.id}/lock`, { method: "DELETE" }).catch(() => {});
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", size);
      window.removeEventListener("beforeunload", beforeUnload);
      ro.disconnect();
      root.remove(); document.body.classList.remove("tr-open");
      if (!FW.inOwnTab()) FW.leaveFull(); else { FW.setTabHandler(null); FW.setEscapeOwner(null); FW.setBeforeClose(null); }
      if (window.__tracer === E) delete window.__tracer;
      ctx.onClose?.();
    });
  }
  const beforeUnload = (e) => { if (E.dirty) { save(false); e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", beforeUnload);
  window.addEventListener("resize", size);
  const ro = new ResizeObserver(() => size());
  ro.observe(canvas);

  // ---- start -------------------------------------------------------------------------------------------------------
  mountRibbon(E);
  // a vector map is opened in the event's frame (its origin): its size is what the file draws, kept with the event
  if (E.map?.kind === "vector" && E.ev.map.kind === "ocad") { E.ev.map.w = E.map.w; E.ev.map.h = E.map.h; }
  renderTabs();
  size();
  refresh();
  const first = M.courseIds(E.ev)[0];
  if (first) E.setCourse(first);
  await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });   // a hidden tab draws no frame
  size();
  fitCourse();
  E.setTool("select");
  banner();
  if (!E.readOnly) await takeLock(false);
  refresh();
  E.status(E.blank ? t("trc.ed.stNoEvent") : E.readOnly ? t("trc.ed.stReadOnly") : t("trc.ed.stReady"), "ok");
  if (!fontsIn) loadFonts(60000).then((ok) => { if (ok && document.body.contains(root)) refresh(); });
  fontCheck();
  syncVector();
  if (E.ev.maps && !E.blank) loadExtraMaps(E);
  // the QR codes on the maps need their library before they are drawn (qr.js)
  if (Object.values(E.ev.specials || {}).some((sp) => sp.kind === "qr")) import("./qr.js").then((Q) => Q.loadQr()).catch(() => {});
  // this device's backgrounds for the event (an event set on OpenStreetMap shows it at once)
  try { if (!E.blank && (localStorage.getItem(`ocn.tr.bg.${E.meta?.id || "x"}`) || E.ev.map.kind === "none")) import("./backdrop.js").then((B) => { B.attach(E); draw(); }); } catch (err) { /* no storage */ }
  // files dropped on the editor: a .ppen is imported, a map replaces the event's
  root.addEventListener("dragover", (e) => { if ([...(e.dataTransfer?.types || [])].includes("Files") && !root.querySelector(".tr-modal")) e.preventDefault(); });
  root.addEventListener("drop", async (e) => {
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length || root.querySelector(".tr-modal")) return;
    e.preventDefault();
    // no event yet, or an Ozimut file: a new event, through the start screen (a map alone: created; a .ozmt, .ocnt or .ppen: imported)
    const ocn = files.some(isOcnFile);
    if ((E.blank || ocn) && E.onStart) { E.onStart(ocn || files.some((f) => /\.(ppen|xml)$/i.test(f.name)) ? "import" : "new", files); return; }
    if (E.readOnly) { E.toast(t("trc.ed.readOnlyDot")); return; }
    const ppen = files.find((f) => /\.(ppen|xml)$/i.test(f.name)), map = files.find(isMapFile);
    // an IOF XML of courses or classes (Condes, OCAD, MeOS…): the advanced level's import
    if (ppen && E.pro && /\.xml$/i.test(ppen.name)) { const iof = await import("./iofin.js"); if (iof.iofKind(await ppen.text())) { iof.importDialog(E, ppen); return; } }
    if (ppen) D.importPpen(E, ppen);
    else if (map) (await import("./extras.js")).changeMap(E, map);
    else E.toast(t("trc.ed.dropWhat"));
  });
  // back online: what waited on this device is sent
  const onOnline = () => { if (E.dirty || E.offline) { E.dirty = true; save(true); } };
  window.addEventListener("online", onOnline);
  E.closeHooks.push(() => window.removeEventListener("online", onOnline));
  if (ctx.dirty && !E.readOnly) { E.dirty = true; scheduleSave(); }              // changes made offline, to send now
  // a .ppen opened on another map than its own: the controls are aligned on this one first (calage.js)
  if (ctx.align && !E.readOnly) (await import("./calage.js")).calage(E, { fromPpen: true });
  return E;
}
const toolHelp = (tool) => (TOOLS.find(([k]) => k === tool.split(":")[0])?.[2]) || (tool.startsWith("special:") ? t("trc.ed.helpSpecial") : "");
const loadPref = (k, d) => { try { const v = JSON.parse(localStorage.getItem("ocn.tr.prefs") || "{}")[k]; return v ?? d; } catch (e) { return d; } };
const savePref = (k, v) => { try { const o = JSON.parse(localStorage.getItem("ocn.tr.prefs") || "{}"); o[k] = v; localStorage.setItem("ocn.tr.prefs", JSON.stringify(o)); } catch (e) { /* this visit */ } };

function shell(E) {
  return `
  <header class="tr-top">
    <button type="button" class="btn btn-sm tr-back" id="tr-close" title="${esc(t("trc.ed.eventsTip"))}">${svg("folder", 15)}<span>${esc(t("trc.ed.events"))}</span></button>
    <span class="tr-title"></span><span class="beta-tag" title="${esc(t("trc.ed.betaTip"))}">${esc(t("trc.ed.beta"))}</span>
    <span class="tr-qat" role="toolbar" aria-label="${esc(t("trc.ed.qat"))}">
      <button type="button" class="tr-icon" id="tr-undo" title="${esc(t("trc.ed.undoTip"))}" aria-label="${esc(t("trc.ed.undo"))}">${svg("undo")}</button>
      <button type="button" class="tr-icon" id="tr-redo" title="${esc(t("trc.ed.redoTip"))}" aria-label="${esc(t("trc.ed.redo"))}">${svg("redo")}</button>
      <span class="tr-qatx" id="tr-qatx"></span>
      <button type="button" class="tr-icon tr-qatmore" id="tr-qatmore" title="${esc(t("trc.ed.qatCustom"))}" aria-label="${esc(t("trc.ed.qatCustom"))}" aria-haspopup="menu">▾</button>
    </span>
    <span class="tr-search">${svg("search", 15)}<input id="tr-rsearch" type="search" placeholder="${esc(t("trc.ed.searchPh"))}" autocomplete="off" spellcheck="false" aria-label="${esc(t("trc.ed.search"))}">
      <div class="tr-rsearch-res" id="tr-rsearch-res" role="listbox" hidden></div></span>
    <span class="tr-status" id="tr-status"></span>
    <button type="button" class="tr-icon" id="tr-rdisplay" title="${esc(t("trc.ed.ribbonDisplayTip"))}" aria-label="${esc(t("trc.ed.ribbonDisplay"))}" aria-haspopup="menu">${svg("ribbon")}</button>
    <span class="fw-btns">${FW.buttons()}</span>
  </header>
  <div class="tr-ribbon" id="tr-ribbon"></div>
  <div class="tr-banner" id="tr-banner" hidden></div>
  <div class="tr-tabbar"><div class="tr-tabs" id="tr-tabs" role="tablist"></div><div class="tr-parts" id="tr-parts" hidden></div><div class="tr-vars" id="tr-vars" hidden></div></div>
  <div class="tr-body">
    <aside class="tr-left">
      <div class="tr-desc" id="tr-desc"></div>
      <div class="tr-info" id="tr-info"></div>
    </aside>
    <div class="tr-split" id="tr-split" role="separator" aria-orientation="vertical" title="${esc(t("trc.ed.splitTip"))}"></div>
    <main class="tr-mapwrap">
      <canvas id="tr-map" tabindex="0" aria-label="${esc(t("trc.ed.mapAria"))}"></canvas>
      <div class="tr-zoombox">
        <button type="button" class="tr-icon" id="tr-zin" title="${esc(t("trc.ed.zoomIn"))}">${svg("plus", 16)}</button>
        <button type="button" class="tr-icon" id="tr-zout" title="${esc(t("trc.ed.zoomOut"))}">${svg("minus", 16)}</button>
        <button type="button" class="tr-icon" id="tr-fit" title="${esc(t("trc.ed.fitCourse"))}">${svg("fit", 16)}</button>
        <label class="tr-intensity" title="${esc(t("trc.ed.intensity"))}"><input type="range" id="tr-intensity" min="0.2" max="1" step="0.05"></label>
      </div>
    </main>
  </div>
  <footer class="tr-foot"><span id="tr-help"></span><span class="tr-foot-r"><span id="tr-pos"></span> · <span id="tr-zoom"></span></span></footer>`;
}
