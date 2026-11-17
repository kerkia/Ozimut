// Cartographier's editor (Orga › « Cartographier », owner 2026-11-06): the map in the middle (view.js), the ribbon above
// (ribbon.js), the symbols on the left, the selection, parts, backgrounds and colours on the right, a status bar that says where
// the pointer is and checks the IOF's minimum sizes while drawing. Drawn in the page under the site's menus as the Tracer is
// (« ⤢ » the whole window). The document (doc.js) is saved a moment after each change, with the version it was made on (a
// teammate's save since: asked what to keep); an editing lock tells the others the map is being edited.

import * as D from "./doc.js";
import * as G from "./geom.js";
import * as S from "./store.js";
import * as T from "./tools.js";
import { View } from "./view.js";
import { mountRibbon } from "./ribbon.js";
import * as P from "./panels.js";
import * as C from "./collab.js";
import { modal, field, sel, num, popupMenu, chooser } from "../tracer/dialogs.js";
import { svg } from "../tracer/icons.js";
import * as FW from "../fullwin.js";
import { t, tn, locale } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nf = (v, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const PREF = "ocn.mp.prefs";
const pref = (k, d) => { try { return JSON.parse(localStorage.getItem(PREF) || "{}")[k] ?? d; } catch (e) { return d; } };
const setPref = (k, v) => { try { const o = JSON.parse(localStorage.getItem(PREF) || "{}"); o[k] = v; localStorage.setItem(PREF, JSON.stringify(o)); } catch (e) { /* this visit */ } };
const KEYS = { "tool:pan": "H", "tool:select": "S", "tool:vertex": "V", "tool:draw": "D", "tool:fill": "F", "tool:cut": "X", "tool:measure": "M", undo: "Ctrl+Z", redo: "Ctrl+Y", delete: "Suppr", duplicate: "Ctrl+D", snap: "N", "mode:straight": "1", "mode:curve": "2", "mode:free": "3", "mode:rect": "4", "mode:circle": "5" };

/**
 * Open the editor in `container`. opts: { id (the map on the server, null for a file opened locally), card, role, doc (map.json),
 * version, source (the OCAD bytes or null), files ({ sha: { bytes, type } } when opened from a .ozmap), onClose, onStart, blank }.
 * blank: no map yet (the page opens the editor at once, its start screen over it, as the Tracer does — owner, 2026-11-07): nothing
 * saved, no team, every change and most commands lead to the start screen. onStart(kind, files): the start screen (pages/mapper.js).
 */
export async function openEditor(opts) {
  const { container } = opts;
  const E = { id: opts.id || null, card: opts.card || null, role: opts.role || "owner", version: opts.version || 0, source: opts.source || null,
    files: opts.files || {}, sel: new Set(), snapping: pref("snap", true), drawMode: pref("mode", "straight"), part: "p1", toolName: "select",
    readOnly: opts.role === "viewer" || !!opts.blank, blank: !!opts.blank, dirty: false, saving: false, gps: null, onStart: opts.onStart || (() => {}) };
  window.__mapper = E;
  const root = document.createElement("div");
  root.className = `tr-app mp-app${E.blank ? " mp-blank" : ""}`;
  root.innerHTML = `
    <div class="tr-top">
      <button type="button" class="tr-icon" data-top="maps" title="${esc(t("map.top.maps"))}">${svg("folder", 18)}</button>
      <button type="button" class="tr-icon mp-drawer" data-top="left" title="${esc(t("map.left.title"))}">${svg("palette", 18)}</button>
      <span class="tr-title" id="mp-title"></span><span class="beta-tag" title="${esc(t("beta.mapper.note"))}">${esc(t("beta.tag"))}</span>
      <span class="mp-save" id="mp-save" aria-live="polite"></span>
      <span class="mp-sp"></span>
      <button type="button" class="tr-icon" data-act="undo" title="${esc(t("map.rib.undo"))} (Ctrl+Z)">${svg("undo", 18)}</button>
      <button type="button" class="tr-icon" data-act="redo" title="${esc(t("map.rib.redo"))} (Ctrl+Y)">${svg("redo", 18)}</button>
      <label class="tr-search mp-search"><input type="search" id="mp-search" placeholder="${esc(t("map.top.search"))}" aria-label="${esc(t("map.top.search"))}"></label>
      <button type="button" class="tr-icon mp-drawer" data-top="right" title="${esc(t("map.right.sel"))}">${svg("list", 18)}</button>
      <span class="fw-btns" id="mp-fw"></span>
    </div>
    <div class="tr-ribbon" id="mp-ribbon"></div>
    <div class="mp-main">
      <aside class="mp-left" id="mp-left"></aside>
      <div class="mp-mapwrap"><div class="mp-map" id="mp-map" tabindex="0" aria-label="${esc(t("map.view.label"))}"></div>
        <div class="mp-toast" id="mp-toast" hidden></div>
        <div class="mp-starthint" id="mp-starthint" hidden><b>${esc(t("map.empty.title"))}</b><p>${esc(t("map.empty.hint"))}</p>
          <div><button type="button" class="btn btn-sm" data-act="tab:data">${esc(t("map.tab.data"))}</button><button type="button" class="btn btn-sm" data-act="tab:backgrounds">${esc(t("map.tab.backgrounds"))}</button></div></div>
        <div class="mp-zoom"><button type="button" data-act="zoom-in" title="${esc(t("map.view.zoomIn"))}">${svg("plus", 16)}</button><button type="button" data-act="zoom-out" title="${esc(t("map.view.zoomOut"))}">${svg("minus", 16)}</button><button type="button" data-act="zoom-fit" title="${esc(t("map.view.fit"))}">${svg("fit", 16)}</button></div>
      </div>
      <aside class="mp-right" id="mp-right"></aside>
    </div>
    <div class="mp-status" id="mp-status"><span id="mp-pos"></span><span id="mp-scale"></span><span id="mp-hint"></span><span id="mp-warn" class="mp-warn"></span><span id="mp-team" class="mp-team"></span></div>`;
  container.innerHTML = "";
  container.appendChild(root);
  document.body.classList.add("tr-open", "mp-open");
  E.root = root;
  // the top line (the map's name, undo, redo, search, ⤢) goes into the site's bar on a computer, out of full window (placeTop below):
  // looked for there too
  const topLine = root.querySelector(".tr-top");
  E.$ = (s) => root.querySelector(s) || topLine.querySelector(s);

  // ---- the document --------------------------------------------------------------------------------------------------------
  E.live = new D.Live(opts.doc, { onChange: (c) => changed(c) });
  E.doc = E.live.doc;
  E.view = new View(E.$("#mp-map"), E.live, { onView: () => { status(); E.field?.onView?.(); } });
  E.view.drawOverlay = (g) => { C.overlay(E, g); E.tool?.overlay?.(g); E.field?.overlay?.(g); P.drawComments?.(E, g); };
  E.refreshFrame = () => import("./data/frame.js").then((F) => F.frameOf(E.doc)).then((f) => { E.frame = f || null; }).catch(() => { E.frame = null; });
  await E.refreshFrame();
  await loadBackgrounds();
  E.view.fit(E.live.bounds());
  await E.live.map.ready;
  E.view.clearTiles();

  // ---- helpers the tools use ----------------------------------------------------------------------------------------------
  E.currentSymbol = () => (E.symbol != null ? E.live.symbol(E.symbol) : null);
  E.say = (msg, kind = "") => {
    const el = E.$("#mp-toast");
    if (!msg) { el.hidden = true; return; }
    el.textContent = msg; el.className = `mp-toast ${kind}`; el.hidden = false;
    clearTimeout(E._toast); E._toast = setTimeout(() => { el.hidden = true; }, kind === "busy" ? 60000 : 4200);
  };
  E.lockedPart = (o) => !!E.doc.parts.find((p) => p.id === (o.part || "p1"))?.locked;
  E.selChanged = () => { E.view.overlay(); E.ribbon?.showContext(); P.drawRight(E); status(); };
  E.hover = (o) => { if (o?.id !== E._hover) { E._hover = o?.id ?? null; E.$("#mp-map").title = o ? symLabel(o.sym) : ""; } };
  E.selKind = () => {
    const list = [...E.sel].map((id) => E.live.object(id)).filter(Boolean);
    if (!list.length) return null;
    if (list.every((o) => o.draft)) return "draft";
    const k = (o) => (o.otp === 1 ? "point" : o.otp === 3 ? "area" : o.otp === 4 || o.otp === 5 || o.otp === 6 ? "text" : "line");
    const kinds = new Set(list.map(k));
    return kinds.size === 1 ? [...kinds][0] : null;
  };
  E.selected = () => [...E.sel].map((id) => E.live.object(id)).filter(Boolean);
  /** One object per Mapper combined object (its copies follow the one changed: doc.js siblings), for the edits of geometry. */
  E.lead = (list) => { const seen = new Set(); return list.filter((o) => { if (o.omap?.o == null) return true; const k = `${o.omap.o}|${o.omap.piece || 0}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
  const symLabel = (sym) => { const s = E.live.symbol(sym); return s ? `${Math.floor(sym / 1000)}${sym % 1000 ? "." + (sym % 1000) : ""} ${P.symName(s)}` : ""; };
  E.symLabel = symLabel;
  const rec = (s, pts, closed) => ({ sym: s.sym, otp: closed ? 3 : 2, ang: 0, coords: G.coordsOf([{ pts, hole: false }]), part: E.part, col: 0, lineWidth: 0, diamFlags: 0 });
  E.addShape = (s, pts, closed) => {
    if (!guard()) return null;
    let o;
    E.live.transact(t("map.undo.draw"), () => { o = E.live.add(rec(s, pts, closed && s.otp === 3)); });
    E.sel.clear(); E.sel.add(o.id); E.selChanged();
    legibility(o);
    return o;
  };
  E.addPoint = (s, at, angDeg = 0) => {
    if (!guard()) return;
    let o;
    E.live.transact(t("map.undo.draw"), () => { o = E.live.add({ sym: s.sym, otp: 1, ang: Math.round(angDeg * 10), coords: [G.pt(at[0], at[1])], part: E.part }); });
    E.sel.clear(); E.sel.add(o.id); E.selChanged();
  };
  E.addText = async (s, at) => {
    if (!guard()) return;
    const v = await modal(E, { title: t("map.text.title"), body: field(t("map.text.label"), `<textarea name="text" rows="3" required></textarea>`) });
    if (!v?.text?.trim()) return;
    let o;
    E.live.transact(t("map.undo.text"), () => { o = E.live.add({ sym: s.sym, otp: 4, ang: 0, coords: [G.pt(at[0], at[1])], text: v.text.replace(/\r?\n/g, "\r\n"), part: E.part }); });
    E.sel.clear(); E.sel.add(o.id); E.selChanged();
  };
  E.moveSelection = (dx, dy) => {
    if (!guard()) return;
    E.live.transact(t("map.undo.move"), () => { for (const o of E.lead(E.selected())) E.live.update(o.id, { coords: o.coords.map((c, i) => (o.otp === 1 && i > 0 ? c : G.moved(c, dx, dy))) }); });
    E.view.overlay();
  };
  E.moveVertex = (id, i, to, { dx, dy }) => {
    if (!guard()) return;
    const o = E.live.object(id); if (!o) return;
    const c = o.coords.slice(), f = G.flags(c[i]);
    c[i] = G.pt(to[0], to[1], f);
    // a point carries its Bézier handles with it
    if (!(f & (G.F.CTRL1 | G.F.CTRL2))) for (const j of [i - 1, i + 1]) if (c[j] && G.isCtrl(c[j])) c[j] = G.moved(c[j], dx, dy);
    // a closed area's first point is also its last
    if (o.otp === 3 && (i === 0 || i === c.length - 1)) { const j = i === 0 ? c.length - 1 : 0; if (G.mmX(o.coords[j]) === G.mmX(o.coords[i]) && G.mmY(o.coords[j]) === G.mmY(o.coords[i])) c[j] = G.pt(to[0], to[1], G.flags(c[j])); }
    E.live.transact(t("map.undo.vertex"), () => E.live.update(id, { coords: c }));
    E.view.overlay();
  };
  E.insertVertex = (id, p) => {
    if (!guard()) return;
    const o = E.live.object(id); if (!o) return;
    // the segment nearest the click, between two plain points (a Bézier segment is cut at its control polygon's nearest side)
    let best = { d: Infinity, i: -1 };
    for (let i = 0; i + 1 < o.coords.length; i++) {
      if (G.isCtrl(o.coords[i + 1]) && !G.isCtrl(o.coords[i])) continue;
      const a = o.coords[i], b = o.coords[i + 1];
      if (G.isHole(b) && !G.isCtrl(b)) continue;
      const r = G.segDist(p[0], p[1], G.mmX(a), G.mmY(a), G.mmX(b), G.mmY(b));
      if (r.d < best.d && !G.isCtrl(a) && !G.isCtrl(b)) best = { ...r, i };
    }
    if (best.i < 0) { E.say(t("map.tool.noSegment")); return; }
    const c = o.coords.slice(); c.splice(best.i + 1, 0, G.pt(best.x, best.y));
    E.live.transact(t("map.undo.vertex"), () => E.live.update(id, { coords: c }));
  };
  E.deleteVertex = (id, i) => {
    if (!guard()) return;
    const o = E.live.object(id); if (!o) return;
    const c = o.coords.slice();
    let from = i, n = 1;
    if (c[i + 1] && (G.flags(c[i + 1]) & G.F.CTRL1)) n += 2;                       // the curve after it
    else if (c[i - 1] && (G.flags(c[i - 1]) & G.F.CTRL2)) { from = i - 2; n = 3; }  // the curve before it
    const keep = G.isHole(c[i]) && c[from + n] ? G.withFlags(c[from + n], G.flags(c[from + n]) | G.F.HOLE) : null;
    c.splice(from, n);
    if (keep) c[from] = keep;
    if (c.filter((x) => !G.isCtrl(x)).length < (o.otp === 3 ? 3 : 2)) { E.say(t("map.tool.tooFew")); return; }
    E.live.transact(t("map.undo.vertex"), () => E.live.update(id, { coords: c }));
  };
  E.toggleCorner = (id, i) => {
    if (!guard()) return;
    const o = E.live.object(id); if (!o) return;
    const c = o.coords.slice(); c[i] = G.withFlags(c[i], G.flags(c[i]) ^ G.F.CORNER);
    E.live.transact(t("map.undo.vertex"), () => E.live.update(id, { coords: c }));
  };
  E.splitLine = (id, p) => {
    if (!guard()) return;
    const o = E.live.object(id); if (!o) return;
    const pts = G.flatten(G.partsOf(o.coords)[0].pts, 0.05);
    const n = G.nearestOn(pts, p[0], p[1]);
    if (n.i < 0) return;
    const a = pts.slice(0, n.i + 1).concat([[n.x, n.y, 0]]), b = [[n.x, n.y, 0]].concat(pts.slice(n.i + 1));
    if (a.length < 2 || b.length < 2) return;
    E.live.transact(t("map.undo.cut"), () => {
      E.live.update(id, { coords: G.coordsOf([{ pts: G.simplify(a, 0.02), hole: false }]) });
      const nb = E.live.add({ ...strip(o), coords: G.coordsOf([{ pts: G.simplify(b, 0.02), hole: false }]) });
      E.sel.clear(); E.sel.add(nb.id);
    });
    E.selChanged();
  };
  E.cutAreas = async (line) => {
    if (!guard()) return;
    const targets = E.selected().filter((o) => o.otp === 3);
    const list = targets.length ? targets : E.live.near(G.bboxOf(line)).filter((o) => o.otp === 3 && !E.lockedPart(o));
    const B = await import("./boolean.js");
    let n = 0;
    const res = [];
    for (const o of list) { const r = await B.cutByLine(o.coords, line); if (r) res.push([o, r]); }
    E.live.transact(t("map.undo.cut"), () => {
      for (const [o, parts] of res) { E.live.update(o.id, { coords: parts[0] }); for (const c of parts.slice(1)) E.live.add({ ...strip(o), coords: c }); n++; }
    });
    E.say(n ? tn("map.tool.cutDone", n) : t("map.tool.cutNone"));
  };
  E.addHole = (id, pts) => {
    if (!guard()) return;
    const o = E.live.object(id); if (!o) return;
    const coords = o.coords.concat(G.coordsOf([{ pts: [{ pts }][0].pts, hole: false }]).map((c, i) => (i === 0 ? G.withFlags(c, G.flags(c) | G.F.HOLE) : c)));
    E.live.transact(t("map.undo.hole"), () => E.live.update(id, { coords }));
  };
  E.showMeasure = (m) => {
    const el = E.$("#mp-hint");
    if (!m) { el.textContent = ""; return; }
    const ground = (m.mm * E.doc.scale) / 1000;
    el.textContent = t("map.status.measure", { mm: nf(m.mm, 1), m: nf(ground, 0), area: m.area ? nf((m.area * E.doc.scale * E.doc.scale) / 1e6, 0) : "—" });
  };
  E.drawingChanged = () => status();

  // ---- what a command can do, which are pressed -----------------------------------------------------------------------------
  const needsSel = new Set(["delete", "duplicate", "changeSymbol", "rotate", "reverse", "smooth", "simplify", "toggleCurves", "toFront", "toBack", "toPart", "rotatePattern", "editText"]);
  E.why = (act) => {
    if (!act) return "";
    if (E.blank && !/^(zoom|file:(new|open|import))/.test(act)) return t("map.ed.needMap");
    if (E.readOnly && !/^(tool:select|tool:pan|tool:measure|zoom|export|gps|stats|check|versions|comments|members|bg-toggle|map-fade|file:)/.test(act)) return t("map.why.readOnly");
    if (needsSel.has(act) && !E.sel.size) return t("map.why.noSel");
    if (["union", "intersection", "difference"].includes(act) && E.selected().filter((o) => o.otp === 3).length < 2) return t("map.why.twoAreas");
    if (act === "join" && E.selected().filter((o) => o.otp === 2).length < 2) return t("map.why.twoLines");
    if (act === "changeSymbol" && !E.currentSymbol()) return t("map.why.noSymbol");
    if (act === "undo" && !E.live.canUndo) return t("map.why.nothing");
    if (act === "redo" && !E.live.canRedo) return t("map.why.nothing");
    if ((act === "draft-accept" || act === "draft-reject" || act === "draft-acceptKind") && !E.doc.objects.some((o) => o.draft)) return t("map.why.noDraft");
    if (/^(to-tracer|invite|members|version-save|versions|comments|photo|comment|sector)$/.test(act) && !E.id) return t("map.why.notSaved");
    return "";
  };
  E.isOn = (act) => {
    if (act.startsWith("tool:")) return E.toolName === act.slice(5);
    if (act.startsWith("mode:")) return E.drawMode === act.slice(5);
    if (act === "snap") return !!E.snapping;
    if (act === "sector") return !!E.mySector;
    if (act === "gps") return !!E.field?.on;
    if (act === "gps-follow") return !!E.field?.follow;
    if (act === "gps-track") return !!E.field?.recording;
    if (act === "bg-toggle") return E.view.backgrounds.some((b) => b.visible);
    return null;
  };
  E.keyOf = (act) => KEYS[act] || "";

  // ---- tools ---------------------------------------------------------------------------------------------------------------
  const TOOLS = { pan: T.panTool, select: T.selectTool, vertex: T.vertexTool, draw: T.drawTool, fill: T.fillTool, cut: T.cutTool, hole: T.holeTool, measure: T.measureTool };
  E.setTool = (name) => {
    E.tool?.cancel?.();
    E.toolName = name; E.tool = TOOLS[name](E);
    // a drawing tool taken while an object is chosen: its tab gives the ribbon back (the drawing modes are in « Dessiner »)
    if (E.ribbon && E.ribbon.tab === "ctx" && !["select", "vertex", "pan"].includes(name)) E.ribbon.tab = name === "draw" ? "draw" : E.ribbon.prev || "draw";
    E.$("#mp-map").style.cursor = E.tool.cursor || "default";
    E.ribbon?.draw(); status(); E.view.overlay();
  };
  E.setTool("select");

  // ---- the actions ---------------------------------------------------------------------------------------------------------
  E.act = async (act, arg) => {
    try { await run(act, arg); } catch (e) { console.error(e); E.say(e.message || String(e), "bad"); }
    E.ribbon?.draw();
  };
  async function run(act, arg) {
    if (E.blank && !/^(zoom|file:(new|open|import))/.test(act)) { E.say(t("map.ed.needMap")); E.onStart(); return; }
    if (act.startsWith("tab:")) { E.ribbon.tab = act.slice(4); E.ribbon.draw(); return; }      // a tab of the ribbon shown (the empty map's hint)
    if (act.startsWith("tool:")) { E.setTool(act.slice(5)); return; }
    if (act.startsWith("mode:")) { E.drawMode = act.slice(5); setPref("mode", E.drawMode); if (E.toolName !== "draw") E.setTool("draw"); return; }
    if (act.startsWith("file:")) { await fileAct(act.slice(5)); return; }
    const sel = /^(rotate|rotatePattern|smooth|simplify|toggleCurves|reverse)$/.test(act) ? E.lead(E.selected()) : E.selected();
    switch (act) {
      case "undo": E.live.undo(); E.sel = new Set([...E.sel].filter((id) => E.live.object(id))); E.selChanged(); return;
      case "redo": E.live.redo(); E.selChanged(); return;
      case "snap": E.snapping = !E.snapping; setPref("snap", E.snapping); return;
      case "zoom-in": E.view.zoomAt(1.5); return;
      case "zoom-out": E.view.zoomAt(1 / 1.5); return;
      case "zoom-fit": E.view.fit(E.sel.size ? selBox() : E.live.bounds()); return;
      case "pipette": E.pipette = true; E.say(t("map.tool.pipette")); return;
      case "delete": if (!guard()) return; E.live.transact(t("map.undo.delete"), () => { for (const o of sel) E.live.remove(o.id); }); E.sel.clear(); E.selChanged(); return;
      case "duplicate": {
        if (!guard()) return;
        const off = 2 * E.view.mmPerPx * 4, made = [];
        // a Mapper combined object's copies go together, as a new group of their own (doc.js siblings)
        const all = [...new Set(sel.flatMap((o) => [o, ...E.live.siblings(o)]))], groups = new Map();
        const omapOf = (o) => (o.omap?.o == null ? o.omap : { ...o.omap, o: groups.get(o.omap.o) ?? (groups.set(o.omap.o, D.newId()), groups.get(o.omap.o)) });
        E.live.transact(t("map.undo.duplicate"), () => { for (const o of all) made.push(E.live.add({ ...strip(o), omap: omapOf(o), coords: o.coords.map((c, i) => (o.otp === 1 && i > 0 ? c : G.moved(c, off, -off))) })); });
        E.sel = new Set(made.map((o) => o.id)); E.selChanged(); return;
      }
      case "changeSymbol": {
        if (!guard()) return;
        const s = E.currentSymbol();
        const ok = (o) => (s.otp === 1 ? o.otp === 1 : s.otp === 3 ? o.otp === 3 || o.otp === 2 : s.otp === 2 ? o.otp === 2 || o.otp === 3 : o.otp === 4 || o.otp === 5 || o.otp === 6);
        let n = 0;
        E.live.transact(t("map.undo.symbol"), () => { for (const o of sel) if (ok(o)) { E.live.update(o.id, { sym: s.sym, otp: s.otp === 3 ? 3 : s.otp === 2 ? 2 : o.otp }); n++; } });
        if (n < sel.length) E.say(t("map.tool.symbolKind"));
        E.selChanged(); return;
      }
      case "reverse": if (!guard()) return; E.live.transact(t("map.undo.reverse"), () => { for (const o of sel) if (o.otp === 2 || o.otp === 3) E.live.update(o.id, { coords: reverseCoords(o.coords) }); }); return;
      case "smooth": case "simplify": case "toggleCurves": {
        if (!guard()) return;
        const tol = act === "simplify" ? Math.max(0.05, 0.6 * E.view.mmPerPx) : 0.04;
        E.live.transact(t(`map.undo.${act}`), () => {
          for (const o of sel) {
            if (o.otp !== 2 && o.otp !== 3) continue;
            const parts = G.partsOf(o.coords).map((p) => {
              const flat = G.flatten(p.pts, 0.05);
              const curved = p.pts.some((q) => q[2] & (G.F.CTRL1 | G.F.CTRL2));
              if (act === "simplify") return { ...p, pts: G.simplify(flat, tol) };
              if (act === "toggleCurves" && curved) return { ...p, pts: G.simplify(flat, 0.03) };
              return { ...p, pts: G.smoothCurve(G.simplify(flat, tol * 3), o.otp === 3) };
            });
            E.live.update(o.id, { coords: G.coordsOf(parts) });
          }
        });
        E.view.overlay(); return;
      }
      case "union": case "difference": case "intersection": {
        if (!guard()) return;
        const B = await import("./boolean.js");
        const areas = sel.filter((o) => o.otp === 3);
        const res = act === "union" ? await B.union(areas.map((o) => o.coords)) : act === "intersection" ? await B.intersection(areas.map((o) => o.coords))
          : await B.difference(areas[0].coords, ...areas.slice(1).map((o) => o.coords));
        const first = areas[0];
        E.live.transact(t(`map.undo.${act}`), () => {
          for (const o of (act === "difference" ? [first] : areas)) E.live.remove(o.id);
          E.sel.clear();
          for (const c of res) { const n = E.live.add({ ...strip(first), coords: c }); E.sel.add(n.id); }
        });
        if (!res.length) E.say(t("map.tool.emptyResult"));
        E.selChanged(); return;
      }
      case "join": {
        if (!guard()) return;
        const lines = sel.filter((o) => o.otp === 2);
        const joined = joinLines(lines);
        if (!joined) { E.say(t("map.tool.joinFar")); return; }
        E.live.transact(t("map.undo.join"), () => { E.live.update(lines[0].id, { coords: joined }); for (const o of lines.slice(1)) E.live.remove(o.id); });
        E.sel = new Set([lines[0].id]); E.selChanged(); return;
      }
      case "rotate": case "rotatePattern": {
        if (!guard()) return;
        const v = await modal(E, { title: t(`map.rib.${act}`), body: field(t("map.dlg.angle"), `<input name="a" type="number" step="0.1" value="0" required>`) });
        if (!v) return;
        const a = num(v.a); if (!Number.isFinite(a)) return;
        const b = selBox(), cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, r = (a * Math.PI) / 180, co = Math.cos(r), si = Math.sin(r);
        E.live.transact(t("map.undo.rotate"), () => {
          for (const o of sel) {
            if (act === "rotatePattern" || o.otp === 1 || o.otp === 4 || o.otp === 5) {
              const patch = { ang: Math.round(((o.ang || 0) + a * 10) % 3600) };
              if (act === "rotate" && o.otp !== 1) Object.assign(patch, { coords: o.coords.map((c) => rot(c, cx, cy, co, si)) });
              if (act === "rotate" && o.otp === 1) patch.coords = [rot(o.coords[0], cx, cy, co, si), ...o.coords.slice(1)];
              E.live.update(o.id, patch);
            } else E.live.update(o.id, { coords: o.coords.map((c) => rot(c, cx, cy, co, si)) });
          }
        });
        return;
      }
      case "editText": {
        const o = sel.find((x) => x.otp === 4 || x.otp === 5 || x.otp === 6);
        if (!o || !guard()) return;
        const v = await modal(E, { title: t("map.text.title"), body: field(t("map.text.label"), `<textarea name="text" rows="4">${esc((o.text || "").replace(/\r\n/g, "\n"))}</textarea>`) });
        if (v) E.live.transact(t("map.undo.text"), () => E.live.update(o.id, { text: v.text.replace(/\r?\n/g, "\r\n") }));
        return;
      }
      case "toFront": case "toBack": {
        if (!guard()) return;
        E.live.transact(t("map.undo.order"), () => {
          for (const o of sel) { const rec = strip(o); rec.id = o.id; E.live.remove(o.id); const n = E.live.add(rec); if (act === "toBack") { const objs = E.doc.objects; objs.splice(objs.indexOf(n), 1); objs.unshift(n); n.ord = -Date.now(); E.live.reorder(n); } }
        });
        return;
      }
      case "toPart": return P.toPartDialog(E);
      case "save-now": await save(true); return;
      case "fit": E.view.fit(E.live.bounds()); return;
    }
    // the larger features, each in its module
    const mod = await import(MODULES[act.split("-")[0]] || MODULES[act] || "./io.js");
    if (mod.act) await mod.act(E, act, arg);
  }
  const MODULES = { bg: "./backgrounds.js", "map-fade": "./backgrounds.js", data: "./dataui.js", draft: "./dataui.js", gps: "./field.js", photo: "./field.js", comment: "./field.js",
    offline: "./field.js", check: "./checks.js", stats: "./checks.js", "print-area": "./layout.js", "north-lines": "./layout.js", "scale-bar": "./layout.js", legend: "./layout.js",
    logo: "./layout.js", credits: "./layout.js", qr: "./layout.js", "symbol-set": "./layout.js", colors: "./layout.js", export: "./io.js", to: "./io.js",
    invite: "./team.js", members: "./team.js", generalise: "./generalise.js", sector: "./collab.js", "symbol-edit": "./symedit.js", "symbol-new": "./symedit.js", "symbol-delete": "./symedit.js", version: "./team.js", versions: "./team.js", comments: "./team.js" };
  async function fileAct(a) {
    if (a === "new" || a === "open" || a === "import") { await save(true); E.onStart(a); return; }
    if (a === "close") { await E.close(); return; }
    if (a === "save-now") { await save(true); return; }
    if (a === "props") { await P.propsDialog(E); return; }
    if (a === "export") { const act = await exportChooser(); if (act) await run(act); return; }
    await run(a === "version-save" ? "version-save" : a === "versions" ? "versions" : a);
  }
  // « Fichier »: a menu, its formats in « Exporter… »'s dialog of cards, as the Tracer's (owner, 2026-11-07)
  E.fileMenu = (btn) => {
    const r = btn.getBoundingClientRect();
    popupMenu(E, r.left, r.bottom + 2, [["new", t("map.file.new"), "file"], ["open", t("map.file.open"), "folder"], ["import", t("map.file.import"), "import"], "-",
      ["save-now", t("map.file.save"), "save"], ["version-save", t("map.rib.version-save"), "save"], ["versions", `${t("map.rib.versions")}…`, "history"], "-",
      ["export", t("map.file.export"), "export"], "-",
      ["props", t("map.file.props"), "sliders"], ["close", t("map.file.close"), "close"]], (k) => E.act(`file:${k}`));
  };
  const EXPORTS = [["print", [["export-pdf", ".pdf", "printer"], ["export-sep", ".pdf", "colors"]]],
    ["mapping", [["export-ocd", ".ocd", "export"], ["export-omap", ".omap", "export"], ["export-ozmap", ".ozmap", "save"]]],
    ["geo", [["export-geotiff", ".png · .pgw · .prj", "map"], ["export-kmz", ".kmz", "globe"], ["export-png", ".png", "image"]]],
    ["ozimut", [["to-tracer", "", "flag"], ["to-mymaps", "", "folder"]]]];
  const exportChooser = () => chooser(E, { title: t("map.exp.title"), sub: t("map.exp.sub"), last: "mapper-export",
    groups: EXPORTS.map(([g, list]) => ({ title: t(`map.exp.g.${g}`), items: list.map(([act, ext, icon]) => ({ act, ext, icon, label: t(`map.exp.${act}`), desc: t(`map.exp.${act}.d`) })) })) });

  // ---- the selection's box, records without their identity -----------------------------------------------------------------
  const selBox = () => { let b = null; for (const o of E.selected()) if (o.bb) b = D.union(b, o.bb); return b; };
  const strip = (o) => { const r = { ...o }; for (const k of ["id", "inst", "bb", "cellKeys", "ord", "rawAt", "dirty", "e", "__rec"]) delete r[k]; return r; };
  E.strip = strip;
  const rot = (c, cx, cy, co, si) => { const x = G.mmX(c) - cx, y = G.mmY(c) - cy; return G.pt(cx + x * co - y * si, cy + x * si + y * co, G.flags(c)); };
  function reverseCoords(coords) {
    return G.coordsOf(G.partsOf(coords).map((p) => {
      const r = p.pts.slice().reverse().map((q) => [q[0], q[1], (q[2] & ~(G.F.CTRL1 | G.F.CTRL2)) | (q[2] & G.F.CTRL1 ? G.F.CTRL2 : 0) | (q[2] & G.F.CTRL2 ? G.F.CTRL1 : 0)]);
      return { ...p, pts: r };
    }));
  }
  function joinLines(lines) {
    if (lines.length < 2) return null;
    const tol = Math.max(0.5, 10 * E.view.mmPerPx);
    let acc = G.partsOf(lines[0].coords)[0].pts;
    const rest = lines.slice(1).map((o) => G.partsOf(o.coords)[0].pts);
    while (rest.length) {
      let found = false;
      for (let i = 0; i < rest.length; i++) {
        const r = rest[i], a0 = acc[0], a1 = acc[acc.length - 1], r0 = r[0], r1 = r[r.length - 1];
        const rev = (x) => x.slice().reverse().map((q) => [q[0], q[1], (q[2] & ~3) | (q[2] & 1 ? 2 : 0) | (q[2] & 2 ? 1 : 0)]);
        if (G.dist(a1, r0) <= tol) acc = acc.concat(r.slice(1));
        else if (G.dist(a1, r1) <= tol) acc = acc.concat(rev(r).slice(1));
        else if (G.dist(a0, r1) <= tol) acc = r.concat(acc.slice(1));
        else if (G.dist(a0, r0) <= tol) acc = rev(r).concat(acc.slice(1));
        else continue;
        rest.splice(i, 1); found = true; break;
      }
      if (!found) return null;
    }
    return G.coordsOf([{ pts: acc, hole: false }]);
  }
  function guard() {
    if (E.blank) { E.say(t("map.ed.needMap")); E.onStart(); return false; }
    if (E.readOnly) { E.say(t("map.why.readOnly")); return false; }
    return true;
  }
  /** The IOF's minimum size of what was just drawn (its symbol's `min`, from the symbol set or minimums.json). */
  function legibility(o) {
    const s = E.live.symbol(o.sym), min = s?.min || P.minimumOf?.(E, o.sym);
    if (!min || !o.bb) { E.$("#mp-warn").textContent = ""; return; }
    const k = s?.min && s.set === "isom2017-2" && E.doc.scale <= 10000 ? 1.5 : 1;
    const parts = G.partsOf(o.coords);
    let msg = "";
    if (o.otp === 3 && min.area) { const a = Math.abs(G.ringArea(G.flatten(parts[0].pts))); if (a < min.area * k * k) msg = t("map.warn.area", { a: nf(a, 2), min: nf(min.area * k * k, 2) }); }
    if (o.otp === 2 && min.length) { const l = G.polyLength(G.flatten(parts[0].pts)); if (l < min.length * k) msg = t("map.warn.length", { l: nf(l, 2), min: nf(min.length * k, 2) }); }
    E.$("#mp-warn").textContent = msg ? `⚠ ${msg}` : "";
  }

  // ---- pointer, wheel, keys --------------------------------------------------------------------------------------------------
  const mapEl = E.$("#mp-map");
  const pointers = new Map();
  let pan = null, pinch = null, spaceDown = false, last = 0, lastAt = null;
  mapEl.addEventListener("contextmenu", (ev) => { ev.preventDefault(); P.contextMenu(E, ev, E.view.toMap(ev.clientX, ev.clientY)); });
  mapEl.addEventListener("pointerdown", (ev) => {
    mapEl.focus({ preventScroll: true });
    pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    mapEl.setPointerCapture(ev.pointerId);
    if (pointers.size === 2) { E.tool?.cancelDrag?.(); const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; pan = null; return; }
    if (ev.button === 1 || ev.button === 2 || spaceDown || (ev.pointerType === "touch" && E.toolName === "select" && !E.live.pick(...E.view.toMap(ev.clientX, ev.clientY), 10 * E.view.mmPerPx))) {
      if (ev.button === 2) return;
      pan = { x: ev.clientX, y: ev.clientY }; mapEl.style.cursor = "grabbing"; return;
    }
    if (ev.button !== 0) return;
    const p = E.view.toMap(ev.clientX, ev.clientY);
    if (E.pipette) { E.pipette = false; const o = E.live.pick(p[0], p[1], 8 * E.view.mmPerPx); if (o) { E.symbol = o.sym; P.drawLeft(E); E.say(symLabel(o.sym)); } return; }
    // a double-click: a second press soon after, at the same spot
    const now = performance.now();
    if (now - last < 350 && lastAt && Math.hypot(ev.clientX - lastAt[0], ev.clientY - lastAt[1]) < 6 && E.tool?.dbl) { E.tool.dbl(ev, p); last = 0; return; }
    last = now; lastAt = [ev.clientX, ev.clientY];
    E.tool?.down?.(ev, p);
  });
  mapEl.addEventListener("pointermove", (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, [ev.clientX, ev.clientY]);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      E.view.panPx(c[0] - pinch.c[0], c[1] - pinch.c[1]); E.view.zoomAt(d / pinch.d, c[0], c[1]); pinch = { d, c }; return;
    }
    if (pan) { E.view.panPx(ev.clientX - pan.x, ev.clientY - pan.y); pan = { x: ev.clientX, y: ev.clientY }; return; }
    const p = E.view.toMap(ev.clientX, ev.clientY);
    E.cursor = p; position(p);
    E.tool?.move?.(ev, p);
  });
  const end = (ev) => {
    pointers.delete(ev.pointerId);
    if (pinch) { if (pointers.size < 2) pinch = null; return; }
    if (pan) { pan = null; mapEl.style.cursor = E.tool?.cursor || "default"; return; }
    if (ev.type === "pointerup") E.tool?.up?.(ev, E.view.toMap(ev.clientX, ev.clientY));
  };
  mapEl.addEventListener("pointerup", end);
  mapEl.addEventListener("pointercancel", end);
  mapEl.addEventListener("wheel", (ev) => { ev.preventDefault(); E.view.zoomAt(Math.exp(-ev.deltaY * (ev.deltaMode ? 0.05 : 0.0018)), ev.clientX, ev.clientY); }, { passive: false });
  const onKey = (ev) => {
    if (!root.isConnected) return;
    const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName) || ev.target.isContentEditable;
    if (inField || document.querySelector(".tr-modal")) return;
    if (ev.key === " ") { spaceDown = ev.type === "keydown"; mapEl.style.cursor = spaceDown ? "grab" : E.tool?.cursor || "default"; ev.preventDefault(); return; }
    if (ev.type !== "keydown") return;
    if (E.tool?.key?.(ev)) { ev.preventDefault(); return; }
    const ctrl = ev.ctrlKey || ev.metaKey, k = ev.key.toLowerCase();
    if (ctrl && k === "z") { ev.preventDefault(); E.act(ev.shiftKey ? "redo" : "undo"); return; }
    if (ctrl && k === "y") { ev.preventDefault(); E.act("redo"); return; }
    if (ctrl && k === "s") { ev.preventDefault(); save(true); return; }
    if (ctrl && k === "d") { ev.preventDefault(); E.act("duplicate"); return; }
    if (ctrl && k === "q" || (ev.altKey && k === "q")) { ev.preventDefault(); E.$("#mp-search").focus(); return; }
    if (ev.key === "Delete" || ev.key === "Backspace") { if (E.sel.size) { ev.preventDefault(); E.act("delete"); } return; }
    if (ev.key === "Escape") { if (E.toolName !== "select") E.setTool("select"); else if (E.sel.size) { E.sel.clear(); E.selChanged(); } return; }
    if (ctrl || ev.altKey) return;
    const tool = { h: "pan", s: "select", v: "vertex", d: "draw", f: "fill", x: "cut", m: "measure" }[k];
    if (tool) { E.setTool(tool); return; }
    const mode = { 1: "straight", 2: "curve", 3: "free", 4: "rect", 5: "circle" }[ev.key];
    if (mode) { E.act(`mode:${mode}`); return; }
    if (k === "n") { E.act("snap"); return; }
    if (ev.key === "+" || ev.key === "=") E.view.zoomAt(1.4);
    if (ev.key === "-") E.view.zoomAt(1 / 1.4);
  };
  document.addEventListener("keydown", onKey);
  document.addEventListener("keyup", onKey);
  P.bindSearch(E, E.$("#mp-search"));
  topLine.addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-act]"); if (b) E.act(b.dataset.act);
    if (ev.target.closest("[data-top=maps]")) save(true).then(() => E.onStart("open"));
    const dr = ev.target.closest("[data-top=left],[data-top=right]");
    if (dr) { const k = `${dr.dataset.top}-open`; root.classList.toggle(k); root.classList.remove(k === "left-open" ? "right-open" : "left-open"); }
  });
  root.querySelector(".mp-zoom").addEventListener("click", (ev) => { const b = ev.target.closest("[data-act]"); if (b) E.act(b.dataset.act); });
  root.querySelector("#mp-starthint").addEventListener("click", (ev) => { const b = ev.target.closest("[data-act]"); if (b) E.act(b.dataset.act); });
  // files dropped on the map: backgrounds, or another map to open
  const wrap = E.$(".mp-mapwrap");
  wrap.addEventListener("dragover", (ev) => { if ([...(ev.dataTransfer?.types || [])].includes("Files")) ev.preventDefault(); });
  wrap.addEventListener("drop", (ev) => {
    const f = [...(ev.dataTransfer?.files || [])]; if (!f.length) return;
    ev.preventDefault();
    if (E.blank) { E.onStart(f.some((x) => /\.(ocd|omap|xmap|ozmap)$/i.test(x.name)) ? "import" : "", f); return; }
    import("./backgrounds.js").then((m) => m.addFiles(E, f));
  });
  E.$("#mp-fw").innerHTML = FW.buttons ? FW.buttons({ tab: false }) : "";
  FW.bindFull?.();

  // ---- status ------------------------------------------------------------------------------------------------------------
  function position(p) {
    const el = E.$("#mp-pos");
    let s = `${nf(p[0], 1)} ; ${nf(p[1], 1)} mm`;
    const w = P.toWorld?.(E, p);
    if (w) s += ` · ${w}`;
    el.textContent = s;
  }
  function status() {
    E.$("#mp-title").textContent = E.blank ? t("map.ed.noMap") : E.doc.title || t("map.untitled");
    E.$("#mp-scale").textContent = t("map.status.scale", { scale: nf(E.doc.scale), view: nf(E.view.k / E.view.dpr * 25.4 / 96 * 100, 0) });
    const hint = E.toolName === "draw" ? t(`map.hint.draw.${E.drawMode}`) : t(`map.hint.${E.toolName}`);
    if (!E._measuring) { const h = E.$("#mp-hint"); h.textContent = (E.sel.size ? tn("map.status.sel", E.sel.size) + " · " : "") + hint; h.title = h.textContent; }
    // a map with nothing on it yet: where to start (it goes with the first object, background or drawing in hand)
    E.$("#mp-starthint").hidden = E.blank || E.readOnly || E.doc.objects.length > 0 || (E.doc.backgrounds || []).length > 0 || E.toolName !== "select";
    E.$("[data-act=undo]").disabled = !E.live.canUndo; E.$("[data-act=redo]").disabled = !E.live.canRedo;
  }
  E.status = status;

  // ---- saving: a moment after each change; the lock kept while editing --------------------------------------------------------
  function changed({ box }) {
    E.view.invalidate(box);
    E.dirty = true;
    saveState("dirty");
    clearTimeout(E._save); E._save = setTimeout(() => save(), 2500);
    status();
    P.drawRight(E);
    E.ribbon?.draw();
  }
  function saveState(k) {
    const el = E.$("#mp-save");
    el.dataset.state = k;
    el.textContent = { dirty: t("map.save.dirty"), saving: t("map.save.saving"), saved: t("map.save.saved"), local: t("map.save.local"), error: t("map.save.error"), conflict: t("map.save.conflict") }[k] || "";
  }
  async function save(force = false) {
    clearTimeout(E._save);
    if (!E.dirty || E.readOnly) return;
    if (!E.id) { saveState("local"); P.keepLocal?.(E); return; }
    if (E.saving) { E._again = true; return; }
    E.saving = true; saveState("saving");
    try {
      const json = E.live.toJSON();
      E.dirty = false;                                     // changes made while it is sent mark it dirty again
      try { E.version = await S.saveDoc(E.id, json, E.version, json.objects.length); }
      catch (e) { E.dirty = true; throw e; }
      E.baseJSON = JSON.stringify(json);
      if (!E.dirty) saveState("saved");
      if (Date.now() - (E._lastVersion || 0) > 30 * 60e3) { E._lastVersion = Date.now(); S.saveVersion(E.id, E.live.toJSON(), t("map.save.auto")).catch(() => {}); }
    } catch (e) {
      // a teammate saved since: their version and ours merged, object by object (collab.js), and saved on theirs
      if (e.status === 409) { saveState("saving"); try { await C.mergeAndSave(E); saveState("saved"); } catch (e2) { saveState("conflict"); await P.conflict(E, e.data, save); } }
      else {
        // without the network: kept on this device, sent when it returns (field.js) — said « kept » only once it is
        // (owner, 2026-11-12: changes lost after F5; a copy that could not be kept was announced as kept)
        let kept = false;
        if (!e.status && !(e instanceof RangeError)) { const F = await import("./field.js"); kept = await F.savePending(E).then(() => true, () => false); }
        saveState(kept ? "local" : "error");
        if (!kept) E.say(t("map.save.failed", { error: e.status ? `${e.status} ${e.message || ""}`.trim() : e.message || String(e) }), "bad");
        E._save = setTimeout(() => save(), 15000);
      }
    } finally {
      E.saving = false;
      if (E._again) { E._again = false; save(); }
    }
    void force;
  }
  E.save = save;
  // several mappers at once: presence, sectors, merged saves (collab.js); no lock on the whole map
  const takeLock = async () => C.start(E);
  E.close = async () => {
    E.closed = true;                                          // a wait for data (dataui.waitTown) stops
    await save(true);
    C.stop(E);
    E.field?.stop?.();
    document.removeEventListener("keydown", onKey); document.removeEventListener("keyup", onKey);
    window.removeEventListener("beforeunload", beforeUnload);
    E.view.destroy();
    document.body.classList.remove("tr-open", "mp-open");
    unplaceTop();
    root.remove();
    if (window.__mapper === E) window.__mapper = null;
    opts.onClose?.();
  };
  const beforeUnload = (ev) => { if (E.dirty) { save(true); ev.preventDefault(); ev.returnValue = ""; } };
  window.addEventListener("beforeunload", beforeUnload);

  async function loadBackgrounds() {
    const B = await import("./backgrounds.js");
    await B.restore(E).catch((e) => console.warn(e));
  }

  // ---- the panes, the ribbon, the fit to the window -------------------------------------------------------------------------
  mountRibbon(E, E.$("#mp-ribbon"));
  P.drawLeft(E); P.drawRight(E);
  const fit = () => { const top = root.getBoundingClientRect().top + window.scrollY; root.style.height = `${Math.max(420, window.innerHeight - Math.max(0, top - window.scrollY) - (FW.isFull?.() ? 0 : 8))}px`; };
  // the top line in the site's bar, where there is room (owner, 2026-11-12): on a computer, out of full window (which hides the bar);
  // over the ribbon otherwise. The bar is drawn again on some changes (country, language): put back then (the observer)
  const wide = matchMedia("(min-width: 901px)");
  function placeTop() {
    const inner = document.querySelector("#topbar .topbar-inner");
    if (!/^#\/(carto|orga-carto)(?:[?/]|$)/.test(location.hash)) { topLine.remove(); return; }   // another page: the editor goes
    if (inner && root.isConnected && wide.matches && !FW.isFull?.()) {
      if (topLine.parentElement !== inner) inner.insertBefore(topLine, inner.querySelector(".topbar-tools"));
      topLine.classList.add("mp-bartop");
    } else {
      if (topLine.parentElement !== root) root.prepend(topLine);
      topLine.classList.remove("mp-bartop");
    }
    fit();
  }
  const barWatch = new MutationObserver(() => { if (!topLine.isConnected) placeTop(); });
  const topbar = document.querySelector("#topbar");
  if (topbar) barWatch.observe(topbar, { childList: true });
  wide.addEventListener("change", placeTop);
  function unplaceTop() { barWatch.disconnect(); wide.removeEventListener("change", placeTop); window.removeEventListener("resize", placeTop); topLine.remove(); }
  placeTop(); window.addEventListener("resize", placeTop);
  E._unfit = () => window.removeEventListener("resize", placeTop);
  await takeLock();
  if (E.id) S.comments(E.id).then((c) => { E.comments = c; E.view.overlay(); }).catch(() => {});
  status(); if (E.blank) saveState(""); else saveState(E.id ? "saved" : "local");
  if (opts.isNew && E.id) { E.dirty = true; save(); }
  return E;
}
