// Cartographier's panes: the symbols on the left (each drawn by the map's own engine, by IOF group, searched by number or name;
// the current symbol is what « Dessiner » draws), on the right the selection's details (symbol, size on the ground, its part,
// its source when generated), the map's parts, its backgrounds and its colours. Also the command search, the right-click menu,
// the map's properties (title, scale, georeferencing, declination) and a save conflict's choice.

import * as G from "./geom.js";
import * as S from "./store.js";
import { compileObject } from "../tracer/vmap/ocad.js";
import { CanvasTarget } from "../tracer/vmap/target.js";
import { Matrix } from "../tracer/vmap/geom.js";
import { modal, field, sel, num, popupMenu } from "../tracer/dialogs.js";
import { svg } from "../tracer/icons.js";
import { drawPins } from "./team.js";
import { has as hasKey, t as tSite } from "../i18n.js";
import { t, tn, locale } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nf = (v, d = 0) => new Intl.NumberFormat(locale(), { minimumFractionDigits: d, maximumFractionDigits: d }).format(v);
const GROUPS = [[100, 199, "relief"], [200, 299, "rock"], [300, 399, "water"], [400, 499, "vegetation"], [500, 599, "manmade"], [600, 699, "technical"], [700, 799, "course"], [0, 99999, "other"]];
const groupOf = (sym) => { const n = Math.floor(sym / 1000); return GROUPS.find(([a, b]) => n >= a && n <= b)[2]; };
/** A symbol's name: an IOF set's from the site's catalogues in the reader's language (« Symboles de carte »'s ms.s.* /
 *  ms.sp.s.*: its number, else its base number for a variant the set adds), else the name the file gives. */
export function symName(s) {
  if (s?.set) {
    const pre = /issprom/i.test(s.set) ? "ms.sp.s." : "ms.s.", n = numLabel(s.sym), base = String(Math.floor(s.sym / 1000));
    // a set of before ISOM 2017-2's revision 6 numbered 105, 203 and 513 what are now 105.1, 203.1 and 513.1
    for (const k of [pre + n, pre + base, `${pre}${base}.1`]) if (hasKey(k)) return tSite(k);
  }
  return s?.description || "";
}
const numLabel = (sym) => `${Math.floor(sym / 1000)}${sym % 1000 ? "." + (sym % 1000) : ""}`;

// ---- the symbols ----------------------------------------------------------------------------------------------------------------
const swatches = new WeakMap();
/** A symbol drawn on a small canvas: a point, a wavy line or a patch of area, by the map's own engine. */
function swatch(E, s, size = 30) {
  let cache = swatches.get(E.live); if (!cache) swatches.set(E.live, (cache = new Map()));
  const key = `${s.sym}:${s.dirty ? JSON.stringify(s).length : 0}`;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement("canvas"); c.width = c.height = size * 2;
  const g = c.getContext("2d");
  const def = E.live.defOf(s.sym);
  let url = "";
  if (def) {
    // the sample's size: about 6 mm for lines and areas; points at their own size, shrunk to fit
    const ext = Math.max(0.6, (s.extent || 0) / 100 * 2.4);
    const span = s.otp === 1 ? Math.max(1.5, ext) : 6, k = (size * 2) / span;
    const mk = (o) => { let inst = null; try { inst = compileObject({ objIndex: 0 }, o, E.live.ctx); } catch (e) { inst = null; } if (inst?.def?.symbols) { const i = inst.def.symbols.lastIndexOf(inst); if (i >= 0) inst.def.symbols.splice(i, 1); } return inst; };
    const h = span / 2;
    const o = s.otp === 1 ? { sym: s.sym, otp: 1, ang: 0, coords: [G.pt(0, 0)] }
      : s.otp === 3 ? { sym: s.sym, otp: 3, ang: 0, coords: [[-h * 0.9, -h * 0.75], [h * 0.9, -h * 0.75], [h * 0.9, h * 0.75], [-h * 0.9, h * 0.75]].map(([x, y]) => G.pt(x, y)) }
      : s.otp === 4 || s.otp === 5 || s.otp === 6 || (s.otp === 2 && s.symTp === 1) ? { sym: s.sym, otp: 4, ang: 0, coords: [G.pt(-h * 0.8, -h * 0.2)], text: "Ab" }
      : { sym: s.sym, otp: 2, ang: 0, coords: [G.pt(-h, -h * 0.2), G.pt(-h * 0.35, h * 0.55, 1), G.pt(h * 0.2, -h * 0.75, 2), G.pt(h * 0.9, h * 0.2)] };
    const inst = mk(o);
    if (inst) {
      const tg = new CanvasTarget(g, new Matrix(k, 0, 0, -k, size, size), { minRes: 1 / k });
      const ro = { minRes: 1 / k, metric: E.live.map.metric, view: [-h, -h, h, h] };
      for (const col of E.live.map.colors) if (def.hasColor?.(col)) { try { inst.draw(tg, col, ro); } catch (e) { /* skip */ } tg.flush?.(); }
      url = c.toDataURL();
    }
  }
  cache.set(key, url);
  return url;
}
export function drawLeft(E) {
  const el = E.$("#mp-left");
  const q = (E._symQ || "").trim().toLowerCase();
  const list = E.doc.symbols.filter((s) => !(s.status & 2) && (!q || numLabel(s.sym).startsWith(q) || symName(s).toLowerCase().includes(q)));
  const by = new Map();
  for (const s of list) { const g = groupOf(s.sym); if (!by.has(g)) by.set(g, []); by.get(g).push(s); }
  for (const l of by.values()) l.sort((a, b) => a.sym - b.sym);
  const recent = (E.recent || []).map((n) => E.live.symbol(n)).filter(Boolean);
  const item = (s) => `<button type="button" class="mp-sym${E.symbol === s.sym ? " on" : ""}" data-sym="${s.sym}" title="${esc(numLabel(s.sym) + " " + symName(s))}">
    <img alt="" src="${swatch(E, s)}" width="30" height="30"><span class="mp-sym-n">${esc(numLabel(s.sym))}</span><span class="mp-sym-d">${esc(symName(s))}</span></button>`;
  el.innerHTML = `<div class="mp-pane-h"><h3>${esc(t("map.left.title"))}</h3><span class="mp-std">${esc(E.doc.standard || "")}</span></div>
    <input type="search" class="mp-sym-q" placeholder="${esc(t("map.left.search"))}" value="${esc(E._symQ || "")}" aria-label="${esc(t("map.left.search"))}">
    ${recent.length ? `<div class="mp-sym-g"><h4>${esc(t("map.left.recent"))}</h4><div class="mp-sym-list">${recent.map(item).join("")}</div></div>` : ""}
    ${GROUPS.filter(([, , g]) => by.has(g)).map(([, , g]) => `<details class="mp-sym-g" ${q || (E._open || ["vegetation", "relief"]).includes(g) ? "open" : ""} data-g="${g}"><summary>${esc(t(`map.grp.sym.${g}`))} <small>${by.get(g).length}</small></summary><div class="mp-sym-list">${by.get(g).map(item).join("")}</div></details>`).join("")}
    ${!list.length ? `<p class="mp-empty">${esc(t("map.left.none"))}</p>` : ""}`;
  el.ondblclick = (ev) => { const b = ev.target.closest("[data-sym]"); if (b && !E.readOnly) import("./symedit.js").then((m) => m.editSymbol(E, Number(b.dataset.sym))); };
  el.oncontextmenu = (ev) => {
    const b = ev.target.closest("[data-sym]"); if (!b || E.readOnly) return;
    ev.preventDefault();
    E.symbol = Number(b.dataset.sym); drawLeft(E);
    popupMenu(E, ev.clientX, ev.clientY, [["symbol-edit", t("map.rib.symbol-edit")], ["symbol-new", t("map.rib.symbol-new")], ["symbol-delete", t("map.rib.symbol-delete")]], (a) => E.act(a));
  };
  el.onclick = (ev) => {
    const b = ev.target.closest("[data-sym]");
    if (!b) return;
    E.symbol = Number(b.dataset.sym);
    E.recent = [E.symbol, ...(E.recent || []).filter((n) => n !== E.symbol)].slice(0, 8);
    if (E.toolName !== "draw" && E.toolName !== "fill") E.setTool("draw");
    drawLeft(E);
  };
  el.querySelector(".mp-sym-q").oninput = (ev) => { E._symQ = ev.target.value; const pos = ev.target.selectionStart; drawLeft(E); const i = E.$(".mp-sym-q"); i.focus(); i.setSelectionRange(pos, pos); };
  for (const d of el.querySelectorAll("details[data-g]")) d.ontoggle = () => { const s = new Set(E._open || ["vegetation", "relief"]); if (d.open) s.add(d.dataset.g); else s.delete(d.dataset.g); E._open = [...s]; };
}

// ---- the right pane: selection, parts, backgrounds, colours ---------------------------------------------------------------------
export function drawRight(E) {
  const el = E.$("#mp-right");
  const tab = E._rtab || "sel";
  const tabs = ["sel", "parts", "bg", "colors", ...(E.issues ? ["issues"] : []), ...(E.genPane ? ["gen"] : [])].map((k) => `<button type="button" class="mp-rtab" data-rtab="${k}" aria-selected="${tab === k}">${esc(t(`map.right.${k}`))}</button>`).join("");
  let body = "";
  if (tab === "sel") body = selHtml(E);
  else if (tab === "parts") body = partsHtml(E);
  else if (tab === "bg") body = bgHtml(E);
  else if (tab === "issues") body = E.issuesHtml ? E.issuesHtml(E) : "";
  else if (tab === "gen") body = E.genPane ? E.genPane.html(E) : "";
  else body = colorsHtml(E);
  el.innerHTML = `<div class="mp-rtabs" role="tablist">${tabs}</div><div class="mp-rbody">${body}</div>`;
  el.onclick = async (ev) => {
    const tb = ev.target.closest("[data-rtab]"); if (tb) { E._rtab = tb.dataset.rtab; drawRight(E); return; }
    if (E._rtab === "gen" && E.genPane && await E.genPane.click(E, ev)) { drawRight(E); return; }
    const a = ev.target.closest("[data-pact]"); if (a) partAct(E, a.dataset.pact, a.dataset.id);
    const b = ev.target.closest("[data-bact]"); if (b) import("./backgrounds.js").then((m) => m.paneAct(E, b.dataset.bact, b.dataset.id));
    const c = ev.target.closest("[data-cact]"); if (c) colorAct(E, c.dataset.cact, Number(c.dataset.num));
    const s = ev.target.closest("[data-sact]"); if (s) E.act(s.dataset.sact);
    const is = ev.target.closest("[data-issue]"); if (is) import("./checks.js").then((m) => { E.issueAt = Number(is.dataset.issue); m.go(E, E.issues[E.issueAt]); });
  };
  el.oninput = (ev) => {
    const r = ev.target.closest("[data-bop]"); if (r) import("./backgrounds.js").then((m) => m.paneAct(E, "opacity", r.dataset.bop, Number(r.value)));
    if (ev.target.id === "mp-mapop") { E.view.mapOpacity = Number(ev.target.value); E.view.request(); }
  };
  el.onchange = (ev) => {
    if (ev.target.id === "mp-overprint") { E.view.overprint = ev.target.checked; E.view.clearTiles(); }
    if (ev.target.id === "mp-part-cur") E.part = ev.target.value;
    if (ev.target.id === "mp-sel-part") { const p = ev.target.value; E.live.transact(t("map.undo.part"), () => { for (const o of E.selected()) E.live.update(o.id, { part: p }); }); }
  };
}
function selHtml(E) {
  const list = E.selected();
  if (!list.length) {
    const s = E.currentSymbol();
    return `<p class="mp-empty">${esc(t("map.sel.none"))}</p>${s ? `<p class="mp-cur">${esc(t("map.sel.current"))} <b>${esc(E.symLabel(s.sym))}</b></p>` : ""}
      <dl class="mp-dl"><dt>${esc(t("map.sel.objects"))}</dt><dd>${nf(E.doc.objects.length)}</dd><dt>${esc(t("map.sel.symbols"))}</dt><dd>${nf(E.doc.symbols.length)}</dd>
      <dt>${esc(t("map.sel.scale"))}</dt><dd>1:${nf(E.doc.scale)}</dd>${E.doc.objects.some((o) => o.draft) ? `<dt>${esc(t("map.sel.drafts"))}</dt><dd>${nf(E.doc.objects.filter((o) => o.draft).length)}</dd>` : ""}</dl>`;
  }
  const k = E.doc.scale / 1000;                                  // metres on the ground per map mm
  const rows = [];
  if (list.length === 1) {
    const o = list[0], parts = G.partsOf(o.coords);
    rows.push([t("map.sel.symbol"), E.symLabel(o.sym)]);
    if (o.otp === 2 && parts.length) { const l = G.polyLength(G.flatten(parts[0].pts)); rows.push([t("map.sel.length"), `${nf(l, 1)} mm · ${nf(l * k, 0)} m`]); }
    if (o.otp === 3 && parts.length) {
      let a = Math.abs(G.ringArea(G.flatten(parts[0].pts)));
      for (const h of parts.slice(1)) a -= Math.abs(G.ringArea(G.flatten(h.pts)));
      rows.push([t("map.sel.area"), `${nf(a, 1)} mm² · ${nf(a * k * k, 0)} m²`]);
      if (parts.length > 1) rows.push([t("map.sel.holes"), String(parts.length - 1)]);
    }
    if (o.otp === 1 || o.otp === 4) rows.push([t("map.sel.angle"), `${nf((o.ang || 0) / 10, 1)}°`]);
    if (o.text) rows.push([t("map.sel.text"), o.text.replace(/\r\n/g, " ⏎ ")]);
    if (o.src) rows.push([t("map.sel.source"), t(`map.src.${o.src}`) + (o.draft ? ` · ${t("map.sel.draft")}` : "")]);
    rows.push([t("map.sel.points"), String(o.coords.filter((c) => !G.isCtrl(c)).length)]);
  } else rows.push([t("map.sel.count"), tn("map.status.sel", list.length)]);
  const partSel = `<label class="mp-row">${esc(t("map.sel.part"))} <select id="mp-sel-part">${E.doc.parts.map((p) => `<option value="${p.id}" ${list.every((o) => (o.part || "p1") === p.id) ? "selected" : ""}>${esc(p.name || t("map.parts.default"))}</option>`).join("")}</select></label>`;
  return `<dl class="mp-dl">${rows.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join("")}</dl>${E.doc.parts.length > 1 ? partSel : ""}
    <div class="mp-btns">${["changeSymbol", "duplicate", "delete"].map((a) => `<button type="button" class="btn btn-sm" data-sact="${a}">${esc(t(`map.rib.${a}`))}</button>`).join("")}
    ${list.some((o) => o.draft) ? `<button type="button" class="btn btn-sm btn-primary" data-sact="draft-accept">${esc(t("map.rib.draft-accept"))}</button>` : ""}</div>`;
}
function partsHtml(E) {
  return `<p class="mp-hint">${esc(t("map.parts.hint"))}</p>
    <label class="mp-row">${esc(t("map.parts.current"))} <select id="mp-part-cur">${E.doc.parts.map((p) => `<option value="${p.id}" ${E.part === p.id ? "selected" : ""}>${esc(p.name || t("map.parts.default"))}</option>`).join("")}</select></label>
    <ul class="mp-list">${E.doc.parts.map((p) => `<li><span>${esc(p.name || t("map.parts.default"))} <small>${nf(E.doc.objects.filter((o) => (o.part || "p1") === p.id).length)}</small></span>
      <button type="button" class="tr-icon" data-pact="hide" data-id="${p.id}" aria-pressed="${!p.hidden}" title="${esc(t(p.hidden ? "map.parts.show" : "map.parts.hide"))}">${svg("view", 16)}</button>
      <button type="button" class="tr-icon" data-pact="lock" data-id="${p.id}" aria-pressed="${!!p.locked}" title="${esc(t(p.locked ? "map.parts.unlock" : "map.parts.lock"))}">${svg("lock", 16)}</button>
      <button type="button" class="tr-icon" data-pact="rename" data-id="${p.id}" title="${esc(t("map.parts.rename"))}">${svg("pencil", 16)}</button>
      ${p.id !== "p1" ? `<button type="button" class="tr-icon" data-pact="delete" data-id="${p.id}" title="${esc(t("map.parts.delete"))}">${svg("trash", 16)}</button>` : ""}</li>`).join("")}</ul>
    <button type="button" class="btn btn-sm" data-pact="add">${esc(t("map.parts.add"))}</button>`;
}
async function partAct(E, a, id) {
  const parts = E.doc.parts.map((p) => ({ ...p }));
  const p = parts.find((x) => x.id === id);
  if (a === "add") {
    const v = await modal(E, { title: t("map.parts.add"), ok: t("map.ok.add"), body: field(t("map.parts.name"), `<input name="name" required maxlength="60">`) });
    if (!v?.name) return;
    const nid = `p${Date.now().toString(36)}`;
    parts.push({ id: nid, name: v.name, hidden: false, locked: false });
    E.part = nid;
  } else if (a === "hide" && p) p.hidden = !p.hidden;
  else if (a === "lock" && p) p.locked = !p.locked;
  else if (a === "rename" && p) { const v = await modal(E, { title: t("map.parts.rename"), body: field(t("map.parts.name"), `<input name="name" required maxlength="60" value="${esc(p.name)}">`) }); if (!v) return; p.name = v.name; }
  else if (a === "delete" && p) {
    if (E.doc.objects.some((o) => o.part === id)) { E.say(t("map.parts.notEmpty")); return; }
    parts.splice(parts.indexOf(p), 1); if (E.part === id) E.part = "p1";
  }
  E.live.transact(t("map.undo.parts"), () => E.live.setDocField("parts", parts));
  E.view.clearTiles();
  drawRight(E);
}
export async function toPartDialog(E) {
  const v = await modal(E, { title: t("map.rib.toPart"), body: field(t("map.sel.part"), sel("p", E.doc.parts.map((p) => [p.id, p.name || t("map.parts.default")]), E.part)) });
  if (!v) return;
  E.live.transact(t("map.undo.part"), () => { for (const o of E.selected()) E.live.update(o.id, { part: v.p }); });
}
function bgHtml(E) {
  const list = E.view.backgrounds;
  return `<label class="mp-row">${esc(t("map.bg.mapOpacity"))} <input type="range" id="mp-mapop" min="0.1" max="1" step="0.05" value="${E.view.mapOpacity}"></label>
    ${list.length ? `<ul class="mp-list">${list.map((b) => `<li class="mp-bg"><span title="${esc(b.name)}">${esc(b.name)}</span>
      <button type="button" class="tr-icon" data-bact="toggle" data-id="${b.id}" aria-pressed="${b.visible}" title="${esc(t("map.bg.toggle"))}">${svg("view", 16)}</button>
      <button type="button" class="tr-icon" data-bact="calage" data-id="${b.id}" title="${esc(t("map.rib.bg-calage"))}">${svg("move", 16)}</button>
      <button type="button" class="tr-icon" data-bact="remove" data-id="${b.id}" title="${esc(t("map.bg.remove"))}">${svg("trash", 16)}</button>
      <input type="range" min="0.05" max="1" step="0.05" value="${b.opacity ?? 0.6}" data-bop="${b.id}" aria-label="${esc(t("map.bg.opacity"))}"></li>`).join("")}</ul>`
    : `<p class="mp-empty">${esc(t("map.bg.none"))}</p>`}
    <div class="mp-btns"><button type="button" class="btn btn-sm" data-bact="add">${esc(t("map.rib.bg-add"))}</button><button type="button" class="btn btn-sm" data-bact="online">${esc(t("map.rib.bg-online"))}</button></div>`;
}
function colorsHtml(E) {
  const cols = E.doc.colors.slice().reverse();
  const css = (c) => { const [C, M, Y, K] = c.cmyk; return `rgb(${Math.round(255 * (1 - C) * (1 - K))},${Math.round(255 * (1 - M) * (1 - K))},${Math.round(255 * (1 - Y) * (1 - K))})`; };
  return `<p class="mp-hint">${esc(t("map.colors.hint"))}</p><ul class="mp-list mp-cols">${cols.map((c) => `<li><i style="background:${css(c)}"></i><span>${esc(c.name)}</span>
    <button type="button" class="tr-icon" data-cact="toggle" data-num="${c.num}" aria-pressed="${!E.view.hiddenColors.has(c.num)}" title="${esc(t("map.colors.toggle"))}">${svg("view", 16)}</button></li>`).join("")}</ul>
    <label class="mp-row"><input type="checkbox" id="mp-overprint" ${E.view.overprint ? "checked" : ""}> ${esc(t("map.colors.overprint"))}</label>`;
}
function colorAct(E, a, n) {
  if (a === "toggle") { if (E.view.hiddenColors.has(n)) E.view.hiddenColors.delete(n); else E.view.hiddenColors.add(n); E.view.clearTiles(); drawRight(E); }
}

// ---- the command search -------------------------------------------------------------------------------------------------------------
export function bindSearch(E, input) {
  let pop = null;
  const close = () => { pop?.remove(); pop = null; };
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  input.addEventListener("input", () => {
    close();
    const q = norm(input.value.trim());
    if (!q) return;
    const cmds = E.ribbon.commands().filter((c) => norm(c.label).includes(q)).slice(0, 8);
    const syms = E.doc.symbols.filter((s) => numLabel(s.sym).startsWith(q) || norm(symName(s)).includes(q)).slice(0, 6);
    pop = document.createElement("div"); pop.className = "tr-rsearch-res";
    pop.innerHTML = cmds.map((c) => `<button type="button" data-a="${esc(c.act)}">${svg(c.icon, 16)}<span>${esc(c.label)}</span></button>`).join("")
      + syms.map((s) => `<button type="button" data-s="${s.sym}"><span>${esc(numLabel(s.sym))}</span><span>${esc(symName(s))}</span><small>${esc(t("map.left.title"))}</small></button>`).join("")
      || `<p class="tr-rsearch-none">${esc(t("map.search.none"))}</p>`;
    input.parentElement.style.position = "relative";
    input.parentElement.appendChild(pop);
    pop.onclick = (ev) => {
      const b = ev.target.closest("button"); if (!b) return;
      close(); input.value = "";
      if (b.dataset.a) E.act(b.dataset.a); else { E.symbol = Number(b.dataset.s); E.setTool("draw"); drawLeft(E); }
    };
  });
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") pop?.querySelector("button")?.click(); if (ev.key === "Escape") { close(); input.blur(); } });
  input.addEventListener("blur", () => setTimeout(close, 200));
}

// ---- the right-click menu ---------------------------------------------------------------------------------------------------------
export function contextMenu(E, ev, p) {
  const hit = E.live.pick(p[0], p[1], 8 * E.view.mmPerPx);
  if (hit && !E.sel.has(hit.id)) { E.sel.clear(); E.sel.add(hit.id); E.selChanged(); }
  const kind = E.selKind();
  const items = kind ? [["changeSymbol", t("map.rib.changeSymbol"), "symbol"], ["duplicate", t("map.rib.duplicate"), "copy"], "-",
    ...(kind === "line" ? [["reverse", t("map.rib.reverse"), "swap"], ["smooth", t("map.rib.smooth"), "route"], ["simplify", t("map.rib.simplify"), "line"]] : []),
    ...(kind === "area" ? [["tool:hole", t("map.rib.tool_hole"), "removecircle"], ["smooth", t("map.rib.smooth"), "route"]] : []),
    ...(kind === "point" || kind === "text" ? [["rotate", t("map.rib.rotate"), "rotate"]] : []),
    ...(kind === "draft" ? [["draft-accept", t("map.rib.draft-accept"), "check"], ["draft-reject", t("map.rib.draft-reject"), "close"]] : []),
    "-", ["pipette-here", t("map.ctxm.pipette"), "target"], ["toFront", t("map.rib.toFront"), "layers"], ["toBack", t("map.rib.toBack"), "layers"],
    "-", ["delete", t("map.rib.delete"), "trash"]]
    : [["zoom-fit", t("map.view.fit"), "fit"], ["paste", t("map.ctxm.paste"), "copy"]];
  popupMenu(E, ev.clientX, ev.clientY, items, (a) => {
    if (a === "pipette-here") { if (hit) { E.symbol = hit.sym; drawLeft(E); } return; }
    E.act(a);
  });
}

// ---- properties, conflicts, coordinates ----------------------------------------------------------------------------------------------
export async function propsDialog(E) {
  const d = E.doc, rw = d.realWorld || {};
  const v = await modal(E, { title: t("map.file.props"), wide: true, body: `
    ${field(t("map.props.title"), `<input name="title" required maxlength="140" value="${esc(d.title)}">`)}
    ${field(t("map.props.scale"), `<input name="scale" type="number" min="500" max="100000" step="1" value="${d.scale}">`, t("map.props.scaleHint"))}
    ${field(t("map.props.crs"), `<input name="epsg" type="number" min="0" step="1" value="${rw.epsg || ""}" placeholder="2154">`, t("map.props.crsHint"))}
    ${field(t("map.props.origin"), `<span class="mp-row"><input name="x" type="number" step="0.01" value="${rw.x || 0}" aria-label="X"><input name="y" type="number" step="0.01" value="${rw.y || 0}" aria-label="Y"></span>`, t("map.props.originHint"))}
    ${field(t("map.props.grivation"), `<input name="angle" type="number" step="0.01" value="${rw.angle || 0}">`, t("map.props.grivationHint"))}
    ${field(t("map.props.declination"), `<input name="decl" type="number" step="0.01" value="${d.declination || 0}">`, t("map.props.declinationHint"))}` });
  if (!v) return;
  E.live.transact(t("map.undo.props"), () => {
    if (v.title !== d.title) E.live.setDocField("title", v.title);
    const sc = num(v.scale); if (sc > 0 && sc !== d.scale) E.live.setDocField("scale", sc);
    const nrw = { ...rw, x: num(v.x) || 0, y: num(v.y) || 0, angle: num(v.angle) || 0, epsg: num(v.epsg) || null, on: true, grid: rw.grid || 0, paperGrid: rw.paperGrid || 0, zone: rw.zone || 0 };
    if (JSON.stringify(nrw) !== JSON.stringify(rw)) E.live.setDocField("realWorld", nrw);
    const dc = num(v.decl); if (Number.isFinite(dc) && dc !== d.declination) E.live.setDocField("declination", dc);
  });
  if (E.id) S.setCard(E.id, { title: E.doc.title, scale: E.doc.scale }).catch(() => {});
  E.refreshFrame?.();
  E.status();
}
export async function conflict(E, info, retry) {
  const v = await modal(E, { title: t("map.conflict.title"), body: `<p>${esc(t("map.conflict.text", { by: info?.by || "?", at: info?.at ? new Date(info.at).toLocaleString(locale()) : "" }))}</p>`,
    ok: t("map.conflict.mine"), cancel: t("map.conflict.theirs") });
  if (v) { E.version = info?.version ?? E.version; E.dirty = true; await retry(); }
  else { const { doc, version } = await S.loadDoc(E.id); if (doc) { E.onStart("reopen", { id: E.id, doc, version }); } }
}
/** The real-world coordinates of a map point (the map's grid; lat/lon when the projection is known), as text. */
export function toWorld(E, p) {
  const f = E.frame;
  if (!f || !E.doc.realWorld?.on) return "";
  try {
    const [X, Y] = f.toReal(p[0], p[1]), ll = f.geo ? f.toLatLon(p[0], p[1]) : null;
    return `E ${nf(X, 0)} N ${nf(Y, 0)}${ll ? ` · ${ll[0].toFixed(5)}, ${ll[1].toFixed(5)}` : ""}`;
  } catch (e) { return ""; }
}
let MINS = null;
if (typeof window !== "undefined") fetch(new URL("./sets/minimums.json", import.meta.url)).then((r) => (r.ok ? r.json() : null)).then((j) => { MINS = j; }).catch(() => {});
/** A symbol number's IOF minimum size, from the specifications (sets/minimums.json), for maps whose symbols carry none. */
export function minimumOf(E, sym) {
  if (!MINS) return null;
  const std = /sprint|ISSprOM/i.test(E.doc.standard || "") || E.doc.scale <= 5000 ? "issprom" : "isom";
  const n = `${Math.floor(sym / 1000)}${sym % 1000 ? "." + (sym % 1000) : ""}`;
  const m = MINS[std]?.[n] || MINS[std]?.[String(Math.floor(sym / 1000))] || MINS[std]?.[`${Math.floor(sym / 1000)}.1`];
  if (!m) return null;
  // the specification's sizes are at its scale (ISOM: 1:15 000); a 1:10 000 map is printed 150 % larger
  const f = std === "isom" && E.doc.scale <= 10000 ? 1.5 : 1;
  return { area: m.area ? m.area * f * f : 0, length: m.length ? m.length * f : 0, width: m.width ? m.width * f : 0 };
}
export function drawComments(E, g) { if (E.comments?.length) drawPins(E, g); }
export { numLabel, groupOf, swatch };
