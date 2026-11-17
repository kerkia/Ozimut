// Cartographier's ribbon, in the Tracer's look (app.css .tr-ribbon…): tabs in the order of a mapper's work, a contextual tab
// that comes with the selection (Ligne, Surface, Point, Texte) and holds what applies to it, big and small buttons, a group's
// name under it. Every button runs one of the editor's actions (editor.js `act`) or chooses a tool; `on` says when a toggle
// is pressed, `ok` when a command can run (else it is greyed, its tooltip saying why). A search (Alt+Q) finds any command.

import { svg } from "../tracer/icons.js";
import { t } from "./lang.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const B = (act, icon, big = false, extra = {}) => ({ act, icon, big, ...extra });

/** The tabs: [{ id, groups: [{ id, items: [item | { stack: [items] }] }] }]; labels from `map.rib.<act>`, groups `map.grp.<id>`. */
export const TABS = [
  { id: "draw", groups: [
    { id: "tools", items: [B("tool:select", "select", true), B("tool:vertex", "vertex", true), B("tool:pan", "move", true)] },
    { id: "draw", items: [B("tool:draw", "pencil", true), { stack: [B("mode:straight", "line"), B("mode:curve", "route"), B("mode:free", "string")] },
      { stack: [B("mode:rect", "rect"), B("mode:circle", "ellipse"), B("tool:fill", "water")] }] },
    { id: "snap", items: [{ stack: [B("snap", "target"), B("pipette", "palette"), B("tool:measure", "ruler")] }] },
    { id: "history", items: [{ stack: [B("undo", "undo"), B("redo", "redo")] }] },
  ] },
  { id: "edit", groups: [
    { id: "pick", items: [B("tool:select", "select", true), B("tool:vertex", "vertex", true), B("tool:pan", "move", true)] },
    { id: "cut", items: [B("tool:cut", "scan", true), { stack: [B("tool:hole", "removecircle"), B("join", "link"), B("reverse", "swap")] }] },
    { id: "combine", items: [{ stack: [B("union", "plus"), B("difference", "minus"), B("intersection", "box")] }] },
    { id: "shape", items: [{ stack: [B("smooth", "route"), B("simplify", "line"), B("toggleCurves", "bend")] }] },
    { id: "symbol", items: [B("changeSymbol", "symbol", true), { stack: [B("rotate", "rotate"), B("duplicate", "copy"), B("delete", "trash")] }] },
    { id: "order", items: [{ stack: [B("toFront", "layers"), B("toBack", "layers"), B("toPart", "parts")] }] },
  ] },
  { id: "backgrounds", groups: [
    { id: "bgAdd", items: [B("bg-add", "image", true), B("bg-online", "globe", true)] },
    { id: "bgPlace", items: [{ stack: [B("bg-calage", "move"), B("bg-georef", "map")] }] },
    { id: "bgView", items: [{ stack: [B("bg-toggle", "view"), B("map-fade", "sliders")] }] },
  ] },
  { id: "data", groups: [
    { id: "area", items: [B("data-area", "frame", true)] },
    { id: "sources", items: [B("data-lidar", "mountain", true), B("data-contours", "routes", true), B("data-national", "layers", true), B("data-osm", "map", true), B("data-town", "boundary", true)] },
    { id: "draft", items: [{ stack: [B("draft-accept", "check"), B("draft-acceptKind", "check"), B("draft-reject", "close")] }] },
  ] },
  { id: "field", groups: [
    { id: "gps", items: [B("gps", "target", true), { stack: [B("gps-follow", "nearest"), B("gps-track", "route"), B("gps-north", "angle")] }] },
    { id: "notes", items: [B("photo", "image", true), B("comment", "comment", true)] },
    { id: "offline", items: [B("offline", "offline", true)] },
  ] },
  { id: "check", groups: [
    { id: "checks", items: [B("check-run", "shield", true), { stack: [B("check-next", "nearest"), B("check-legibility", "ruler")] }] },
    { id: "stats", items: [B("stats", "chart", true)] },
    { id: "generalise", items: [B("generalise", "sliders", true)] },
  ] },
  { id: "layout", groups: [
    { id: "frame", items: [B("print-area", "frame", true)] },
    { id: "furniture", items: [{ stack: [B("north-lines", "angle"), B("scale-bar", "ruler"), B("legend", "list")] }, { stack: [B("logo", "image"), B("credits", "text"), B("qr", "hash")] }] },
    { id: "symbols", items: [B("symbol-edit", "symbol", true), { stack: [B("symbol-new", "plus"), B("symbol-delete", "trash"), B("symbol-set", "palette")] }, B("colors", "colors", true)] },
  ] },
  { id: "print", groups: [
    { id: "pdf", items: [B("export-pdf", "printer", true), B("export-sep", "colors", true), B("export-png", "image", true)] },
    { id: "files", items: [{ stack: [B("export-ocd", "export"), B("export-omap", "export"), B("export-ozmap", "save")] }, { stack: [B("export-kmz", "globe"), B("export-geotiff", "map")] }] },
    { id: "send", items: [B("to-tracer", "flag", true), B("to-mymaps", "folder", true)] },
  ] },
  { id: "team", groups: [
    { id: "share", items: [B("invite", "team", true), B("members", "team", true), B("sector", "frame", true)] },
    { id: "history2", items: [B("version-save", "bookmark", true), B("versions", "history", true)] },
    { id: "comments", items: [B("comments", "comment", true)] },
  ] },
];
/** The contextual tab for the selection's kind. */
export const CONTEXT = {
  line: [{ id: "ctxShape", items: [B("reverse", "swap", true), B("join", "link", true), { stack: [B("smooth", "route"), B("simplify", "line"), B("toggleCurves", "bend")] }] },
    { id: "ctxSymbol", items: [B("changeSymbol", "symbol", true), { stack: [B("duplicate", "copy"), B("delete", "trash")] }] }],
  area: [{ id: "ctxShape", items: [B("tool:hole", "removecircle", true), { stack: [B("union", "plus"), B("difference", "minus"), B("intersection", "box")] }, { stack: [B("smooth", "route"), B("simplify", "line")] }] },
    { id: "ctxSymbol", items: [B("changeSymbol", "symbol", true), { stack: [B("rotatePattern", "rotate"), B("duplicate", "copy"), B("delete", "trash")] }] }],
  point: [{ id: "ctxSymbol", items: [B("changeSymbol", "symbol", true), B("rotate", "rotate", true), { stack: [B("duplicate", "copy"), B("delete", "trash")] }] }],
  text: [{ id: "ctxText", items: [B("editText", "text", true), B("rotate", "rotate", true), { stack: [B("changeSymbol", "symbol"), B("delete", "trash")] }] }],
  draft: [{ id: "ctxDraft", items: [B("draft-accept", "check", true), B("draft-reject", "close", true)] }],
};
export const FILE = ["new", "open", "import", "save-now", "version-save", "versions", "export", "props", "close"];

export function mountRibbon(E, host) {
  // on a phone or a tablet « Terrain » comes first and opens: what one does out there (owner, 2026-11-17)
  const R = { tab: E.touch ? "field" : "draw" };
  const tabList = () => (E.touch ? [TABS.find((x) => x.id === "field"), ...TABS.filter((x) => x.id !== "field")] : TABS);
  const label = (act) => t(`map.rib.${act.replace(/[:]/g, "_")}`);
  const tip = (it) => { const why = E.why?.(it.act); return label(it.act) + (E.keyOf?.(it.act) ? ` (${E.keyOf(it.act)})` : "") + (why ? ` — ${why}` : ""); };
  const btn = (it, small) => {
    const on = E.isOn?.(it.act), why = E.why?.(it.act);
    return `<button type="button" class="${small ? "tr-rsmall" : "tr-rbig"}" data-act="${esc(it.act)}" title="${esc(tip(it))}"${on != null ? ` aria-pressed="${on}"` : ""}${why ? ' aria-disabled="true"' : ""}>${svg(it.icon, small ? 16 : 24)}<span class="tr-rl">${esc(label(it.act))}</span></button>`;
  };
  const groupHtml = (g) => `<div class="tr-rgrp"><div class="tr-rgrp-body">${g.items.map((it) => (it.stack ? `<div class="tr-rstack">${it.stack.map((x) => btn(x, true)).join("")}</div>` : btn(it, !it.big))).join("")}</div><div class="tr-rgrp-t">${esc(t(`map.grp.${g.id}`))}</div></div>`;
  function draw() {
    const kind = E.selKind?.();
    const ctxGroups = kind ? CONTEXT[kind] : null;
    if (R.tab === "ctx" && !ctxGroups) R.tab = R.prev || "draw";
    const tabs = tabList().map((x) => `<button type="button" class="tr-rtab" role="tab" data-tab="${x.id}" aria-selected="${R.tab === x.id}">${esc(t(`map.tab.${x.id}`))}</button>`).join("");
    const ctx = ctxGroups ? `<div class="tr-rctx${R.pulse ? " new" : ""}"><span class="tr-rctx-h">${esc(t(`map.ctx.${kind}`))}</span><button type="button" class="tr-rtab" role="tab" data-tab="ctx" aria-selected="${R.tab === "ctx"}">${esc(t("map.ctx.tab"))}</button></div>` : "";
    const groups = R.tab === "ctx" ? ctxGroups : TABS.find((x) => x.id === R.tab)?.groups || [];
    // a row that scrolls sideways (a phone) stays where it was when its tab is drawn again, and the tab opened stays in sight
    const wasTab = host.dataset.open, keepBody = host.querySelector(".tr-rbody")?.scrollLeft || 0, keepTabs = host.querySelector(".tr-rtabs")?.scrollLeft || 0;
    host.innerHTML = `<div class="tr-rtabs" role="tablist"><button type="button" class="tr-rtab file" data-file>${esc(t("map.tab.file"))}</button>${tabs}${ctx}</div>
      <div class="tr-rbody">${groups.map(groupHtml).join("")}</div>`;
    host.dataset.display = E.ribbonDisplay || "full";
    host.dataset.open = R.tab;      // (not « data-tab »: a click looks for its tab's)
    const tabsEl = host.querySelector(".tr-rtabs"), cur = tabsEl.querySelector('[aria-selected="true"]');
    tabsEl.scrollLeft = keepTabs;
    if (wasTab === R.tab) host.querySelector(".tr-rbody").scrollLeft = keepBody;
    if (cur && tabsEl.scrollWidth > tabsEl.clientWidth) {
      const box = tabsEl.getBoundingClientRect(), b = cur.getBoundingClientRect();
      if (b.left < box.left) tabsEl.scrollLeft += b.left - box.left - 8; else if (b.right > box.right) tabsEl.scrollLeft += b.right - box.right + 8;
    }
  }
  host.addEventListener("click", (ev) => {
    const tb = ev.target.closest("[data-tab]");
    if (tb) { if (R.tab !== "ctx") R.prev = R.tab; R.tab = tb.dataset.tab; R.pulse = false; draw(); return; }
    if (ev.target.closest("[data-file]")) { E.fileMenu(ev.target.closest("[data-file]")); return; }
    const b = ev.target.closest("[data-act]");
    if (!b) return;
    if (b.getAttribute("aria-disabled") === "true") { E.say(E.why(b.dataset.act)); return; }
    E.act(b.dataset.act);
  });
  host.addEventListener("contextmenu", (ev) => ev.preventDefault());
  R.draw = draw;
  // (owner, 2026-11-17: each object just drawn took the ribbon to its own tab, and the drawing modes went out of reach in the
  // middle of a drawing session; as in the Tracer, the tab then only shows itself, with a pulse)
  R.showContext = () => {
    const kind = E.selKind?.(), choosing = ["select", "vertex"].includes(E.toolName);
    R.pulse = false;
    if (kind && R.tab !== "ctx") { if (choosing) { R.prev = R.tab; R.tab = "ctx"; } else R.pulse = true; }
    draw();
  };
  /** Every command, for the search. */
  R.commands = () => {
    const out = new Map();
    const walk = (items) => { for (const it of items) { if (it.stack) walk(it.stack); else out.set(it.act, it); } };
    for (const tab of TABS) for (const g of tab.groups) walk(g.items);
    for (const a of FILE) out.set(`file:${a}`, { act: `file:${a}`, icon: "file" });
    return [...out.values()].map((it) => ({ ...it, label: label(it.act) }));
  };
  E.ribbon = R;
  draw();
  return R;
}
