// What a deploy's build knows about the pages (2026-11-17, tools/front_build.mjs: the code published as a copy under
// /assets/v/<build>/, kept by the browser for good; index.html then sets window.__oz). Its manifest names each route's page
// and that page's modules, so that the router asks for them all at once — they were found one level of imports after the
// other, four or five round trips for the analyses — and for the page's own texts (i18n.loadPage) before its module runs.
// On the local server there is no build: nothing here does anything, the modules load as they are written.
import { loadPage } from "./i18n.js";

const OZ = typeof window !== "undefined" ? window.__oz : null;
/** This deploy's build (what assets/build.txt says), null without one. */
export const BUILD = OZ?.v || null;

/** Whether a newer deploy replaced this page's code (assets/build.txt differs from BUILD). The deploy drops the build
 *  before's folder, so a worker or module this page asks for now gets the site's page instead: false on the local server. */
export async function replaced() {
  if (!BUILD) return false;
  try {
    const r = await fetch("/assets/build.txt", { cache: "no-store" });
    const v = r.ok ? (await r.text()).trim() : "";
    return /^[0-9a-f]{8,40}$/.test(v) && v !== BUILD;
  } catch (e) { return false; }
}
let MAN = null;
if (BUILD) { try { MAN = (await import("./gen/manifest.js")).default; } catch (e) { MAN = null; } }

const HERE = new URL("./", import.meta.url);
const asked = new Set();
function preload(page) {
  const p = MAN?.pages[page];
  if (!p || asked.has(page)) return;
  asked.add(page);
  for (const m of [p.file, ...p.mods]) {
    const l = document.createElement("link");
    l.rel = "modulepreload";
    l.href = new URL(m, HERE).href;
    document.head.appendChild(l);
  }
}

/** A route is about to open: its modules are asked for, all at once; resolves once its texts are loaded. */
export function prepare(route) {
  const page = MAN?.routes[route];
  if (!page) return Promise.resolve();
  preload(page);
  return loadPage(page);
}

/** The pages the reader may open next (the menu's): their modules and texts fetched while the browser has nothing to do —
 *  one page at a time, the heavy tools apart, and not on a connection that asks to save data. */
export function warm(routes) {
  if (!MAN) return;
  const c = navigator.connection;
  if (c && (c.saveData || /2g/.test(c.effectiveType || ""))) return;
  const todo = [...new Set(routes.map((r) => MAN.routes[r]).filter((p) => p && !asked.has(p) && MAN.pages[p].mods.length <= 30))].slice(0, 8);
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
  const next = () => {
    const page = todo.shift();
    if (!page) return;
    preload(page);
    loadPage(page).catch(() => {}).then(() => idle(next, { timeout: 4000 }));
  };
  setTimeout(() => idle(next, { timeout: 4000 }), 1500);
}
