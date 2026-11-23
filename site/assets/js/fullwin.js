// Full window for the pages built around a map — the analyses' playback (« Analyse solo », « Analyse multi ») and the
// Tracer's editor, the same two buttons on each (owner, 2026-10-15: the room for the map, without the site's menus stacked
// above it; one way for all, the analyses' — the Tracer's overlay had no obvious way back to the site). « ⤢ » hides the site's
// bar and footer and lets the page fill the window (Échap or « ⤡ » « Revenir au menu » brings them back); « ↗ » opens the
// same page alone in a new tab (?fen=1), in full window, where « ⤡ » brings the menus back too (owner, 2026-10-15: its former
// « ✕ Fermer cet onglet » did not close it - a browser refuses to close a tab that was reloaded or not opened by script). The
// tab is opened by script, without « noopener », so it starts with a copy of this tab's session storage: « Analyse solo »
// finds its files there as after a reload.

import { inApp } from "./appbridge.js";
import { t } from "./i18n.js";

const CLS = "full-win";
export const inOwnTab = () => /[?&]fen=1(?:&|$)/.test(location.hash);
export const isFull = () => document.body.classList.contains(CLS);

const look = () => { const on = isFull(); return { on, text: on ? "⤡" : "⤢",
  title: on ? t("fw.back") : t("fw.full") }; };
function label() {
  const l = look();
  for (const b of document.querySelectorAll('[data-fw="toggle"]:not(#fw-guard)')) { b.setAttribute("aria-pressed", String(l.on)); b.textContent = l.text; b.title = l.title; }
}
/* The browser's own full screen with it (owner, 2026-11-12: as Virtually's, the browser's bars and tabs gone too): asked on « ⤢ »
   (a click: browsers grant it only on a gesture; a « ↗ » tab, opened in full window without one, keeps them), left with « ⤡ ».
   Échap stays the page's where the browser lets it (Chromium's keyboard lock: the Tracer cancels a tool first, a long press leaves
   the full screen); elsewhere Échap leaves the browser's full screen, and full window with it (`fullscreenchange`). */
let ours = false;
function screenFull(on) {
  const d = document;
  if (on && !d.fullscreenElement && d.documentElement.requestFullscreen) {
    d.documentElement.requestFullscreen({ navigationUI: "hide" }).then(() => { ours = true; navigator.keyboard?.lock?.(["Escape"])?.catch?.(() => {}); }).catch(() => {});
  } else if (!on && ours && d.fullscreenElement) { ours = false; navigator.keyboard?.unlock?.(); d.exitFullscreen().catch(() => {}); }
  else if (!on) ours = false;
}
document.addEventListener("fullscreenchange", () => {
  if (document.fullscreenElement || !ours) return;
  ours = false; navigator.keyboard?.unlock?.();
  if (isFull()) setFull(false);
});
export function setFull(on) {
  screenFull(!!on);
  document.body.classList.toggle(CLS, !!on);
  label();
  guard(!!on);
  window.dispatchEvent(new Event("resize"));             // the pages fit their height to the window on resize
}
/* Full window always has a way back to the menus (owner, 2026-10-17: « Analyse solo » opened in full window at its calibration,
   whose step draws no « ⤡ », left no way back): while it is on, a « ⤡ Revenir au menu » of its own shows in the window's top
   right corner whenever the page shows none. */
let guardTimer = null;
function guard(on) {
  clearInterval(guardTimer); guardTimer = null;
  let b = document.getElementById("fw-guard");
  if (!on) { b?.remove(); return; }
  if (!b) {
    b = document.createElement("button");
    b.type = "button"; b.id = "fw-guard"; b.className = "btn btn-sm fw-btn"; b.dataset.fw = "toggle";
    b.textContent = `⤡ ${t("fw.backShort")}`; b.title = t("fw.back");
    b.style.cssText = "position:fixed;top:8px;right:8px;z-index:400;box-shadow:var(--shadow-pop)";
    document.body.appendChild(b);
  }
  const check = () => {
    const own = [...document.querySelectorAll('[data-fw="toggle"]')].some((x) => x !== b && x.getClientRects().length > 0);
    b.hidden = own;
  };
  check();
  guardTimer = setInterval(check, 700);
}
/** Leaving the page: the site's bar comes back. */
export function leaveFull() { tabParams = null; tabHandler = null; escapeOwner = null; beforeClose = null; if (isFull()) setFull(false); }
/** What a page adds to the address of the tab « ↗ » opens (e.g. « Analyse solo »: its files' key and « play »), or null. */
let tabParams = null, tabHandler = null, escapeOwner = null, beforeClose = null;
export function setTabParams(fn) { tabParams = fn; }
/** A page that opens the new tab itself (the Tracer: saves, hands the event over, closes it here). */
export function setTabHandler(fn) { tabHandler = fn; }
/** A page that handles Échap itself (the Tracer's editor cancels a tool or a selection first, then leaves full window). */
export function setEscapeOwner(fn) { escapeOwner = fn; }
/** What a page does before its own tab closes (the Tracer saves); kept for the pages that set it. */
export function setBeforeClose(fn) { beforeClose = fn; }
export function newTab() {
  const h = location.hash || "#/";
  const extra = { fen: "1", ...(tabParams?.() || {}) };
  const [path, query = ""] = h.split("?");
  const q = new URLSearchParams(query);
  for (const [k, v] of Object.entries(extra)) if (v != null && v !== "") q.set(k, String(v)); else q.delete(k);
  window.open(`${location.href.replace(/#.*$/, "")}${path}?${q}`, "_blank");
}
/** The two buttons, as HTML (pages pass it through raw()); `tab: false` leaves « ↗ » out (the analyses, owner 2026-11-06: of no use
 *  on a phone, and not wanted on a computer either). */
export const buttons = ({ tab = true } = {}) => { const l = look(); return `<button type="button" class="btn btn-sm fw-btn" data-fw="toggle" aria-pressed="${l.on}" title="${l.title}">${l.text}</button>${inOwnTab() || !tab || inApp() ? "" : `<button type="button" class="btn btn-sm fw-btn" data-fw="tab" title="${t("fw.tab")}">↗</button>`}`; };

let bound = false;
/** Once per visit: the buttons' clicks (wherever a page draws them) and Échap. */
export function bindFull() {
  label();
  if (bound) return;
  bound = true;
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[data-fw]");
    if (!b) return;
    if (b.dataset.fw === "tab") { if (tabHandler) tabHandler(); else newTab(); return; }
    setFull(!isFull());
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !isFull() || escapeOwner?.()) return;
    if (e.target.closest?.("input, textarea, select, [contenteditable], .modal, dialog")) return;
    setFull(false);
  });
}
